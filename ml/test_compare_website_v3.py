"""Synthetic paired metric/provenance checks. No real cohort predictions."""
from copy import deepcopy
from collections import Counter
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

from ml import compare_website_v3 as compare
from ml import test_run_v3 as fixtures
from ml.experiment_v3 import KNOWN_CLASSES, UNKNOWN
from ml.test_canonical_v3 import compact, sha


def write(path, value):
    path.write_bytes(json.dumps(value, ensure_ascii=False, indent=2).encode())


class PairedMetricsTests(unittest.TestCase):
    def calculate(self, candidate=None, baseline=None, eligible=None, accepted=None, errors=None, top2=None):
        y = np.asarray([*KNOWN_CLASSES, "unknown", "unknown"])
        p = np.asarray(candidate if candidate is not None else [*KNOWN_CLASSES, UNKNOWN, UNKNOWN])
        b = np.asarray(baseline if baseline is not None else ["speech", "speech", "traffic", "wind", "buzz", "buzz", UNKNOWN])
        accept = np.asarray(accepted if accepted is not None else [True]*5 + [False]*2, dtype=np.bool_)
        self.y = y
        return compare.paired_metrics({"labels": p, "accepted": accept}, b, top2 or [[str(x), "speech"] for x in b], y,
            np.asarray(eligible if eligible is not None else [True]*7, dtype=np.bool_), np.asarray(["g"+str(i) for i in range(7)]), np.asarray(["fixture"]*7), np.asarray(["collection"]*7), np.asarray(errors if errors is not None else [False]*7, dtype=np.bool_))

    def test_known_macro_f1_five_labels_and_relative_pass(self):
        result = self.calculate()
        self.assertTrue(result["relativeRecognitionPassed"])
        self.assertEqual(result["candidate"]["knownTop1MacroF1"], 1)
        self.assertEqual(result["baseline"]["knownTop1MacroF1"], 0)
        self.assertEqual(result["candidate"]["unknownEligibleHintRate"], {"successes":0,"total":2,"rate":0})
        self.assertFalse(result["productIntegrationAllowed"])

    def test_primary_unknown_argmax_is_false_negative_not_removed(self):
        result = self.calculate(candidate=[UNKNOWN,"mechanical_fan","speech","traffic","wind",UNKNOWN,UNKNOWN], accepted=[False,True,True,True,True,False,False])
        self.assertAlmostEqual(result["candidate"]["knownTop1MacroF1"], .8)
        self.assertFalse(result["relativeRecognitionPassed"])
        self.assertFalse(result["relativeChecks"]["allFiveClassesHaveCorrectAcceptance"])

    def test_strict_greater_not_greater_equal(self):
        result = self.calculate(baseline=[*KNOWN_CLASSES,UNKNOWN,UNKNOWN])
        self.assertEqual(result["pairedKnownMacroF1Difference"], 0)
        self.assertFalse(result["relativeChecks"]["strictlyGreaterKnownMacroF1"])

    def test_quality_blocked_both_abstain_full_denominators_retained(self):
        result = self.calculate(eligible=[True,True,True,True,True,False,True], candidate=[*KNOWN_CLASSES,"buzz",UNKNOWN], accepted=[True]*6+[False])
        self.assertEqual(result["counts"]["total"],7)
        self.assertEqual(result["counts"]["qualityBlockedBothAbstain"],1)
        self.assertEqual(result["candidate"]["unknownFullHintRate"], {"successes":0,"total":2,"rate":0})
        self.assertEqual(result["baseline"]["unknownFullHintRate"]["successes"],0)
        result = self.calculate(eligible=[False,True,True,True,True,True,True])
        self.assertEqual(result["status"],"inconclusive")
        self.assertEqual(result["candidate"]["perClass"][0]["fullTrueCount"],1)
        self.assertEqual(result["candidate"]["perClass"][0]["eligibleTrueCount"],0)

    def test_precision_known_is_distinct_from_mixture_and_top2_exposure(self):
        result = self.calculate(candidate=[*KNOWN_CLASSES,"buzz",UNKNOWN], accepted=[True]*6+[False], baseline=[*KNOWN_CLASSES,UNKNOWN,UNKNOWN], top2=[[str(x),"speech"] for x in [*KNOWN_CLASSES,UNKNOWN,UNKNOWN]])
        self.assertEqual(result["candidate"]["knownSelectivePrecision"]["rate"],1)
        self.assertEqual(result["candidate"]["mixturePrecision"]["rate"],5/6)
        self.assertFalse(result["relativeChecks"]["unknownHintRateAtMostBaseline"])
        self.assertEqual(result["baselineActualTop2Exposure"]["quietTop1WithKnownSecondOnUnknown"],2)
        self.assertEqual(result["baselineActualTop2Exposure"]["unknownAnyKnownFamilyEligible"]["rate"],1)

    def test_runtime_errors_no_unknowns_or_no_emissions_are_inconclusive(self):
        for kwargs in ({"errors":[False]*6+[True]}, {"eligible":[True]*5+[False,False]}, {"accepted":[False]*7}):
            with self.subTest(kwargs=kwargs):
                result = self.calculate(**kwargs)
                self.assertFalse(result["relativeRecognitionPassed"])
                self.assertEqual(result["status"],"inconclusive")


class ComparisonOrchestrationTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.RunnerV3Tests("test_fit_freezes_complete_evidence_before_single_call_and_never_overwrites")
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        f = self.fixture
        f.complete_fit()
        self.root, self.output = f.root, f.root/"compared"
        self.fit = f.fit_dir
        # Complete synthetic original report, rebinding its completion bytes.
        report = json.loads((self.fit/"development_v3.json").read_bytes())
        report["developmentAudit"] = {"developmentAuditPassed":False,"synthetic":True}
        write(self.fit/"development_v3.json", report)
        completed = json.loads((self.fit/"fit-completion.json").read_bytes())
        raw = (self.fit/"development_v3.json").read_bytes()
        completed["artifacts"]["development_v3.json"] = {"bytes":len(raw),"sha256":sha(raw)}
        write(self.fit/"fit-completion.json", completed)
        self.head = json.loads((self.fit/"research_head_v3.json").read_bytes())
        self.source = f.final_source
        source = json.loads(self.source.read_bytes())
        for r in source["records"]: r["split"] = "test" if r["label"] in KNOWN_CLASSES else "ood_test"
        write(self.source, source)
        # Recreate complete stage/embedding metadata without touching vectors.
        staged = json.loads(Path(f.final_batch.staged_manifest_path).read_bytes())
        for row, r in zip(staged["records"],source["records"]): row.update(split=r["split"],source_record=r)
        write(Path(f.final_batch.staged_manifest_path),staged)
        fixtures.bind_batch(f.final_batch,self.source)
        # Synthetic fit's pre-frozen final SHA needs binding to our fixture source.
        fit_input = json.loads((self.fit/"fit-input.json").read_bytes())
        fit_input["frozenFinalSourceSha256"] = sha(self.source.read_bytes())
        write(self.fit/"fit-input.json",fit_input)
        complete = json.loads((self.fit/"fit-completion.json").read_bytes())
        raw = (self.fit/"fit-input.json").read_bytes()
        complete["artifacts"]["fit-input.json"] = {"bytes":len(raw),"sha256":sha(raw)}
        complete["fitInputSha256"] = sha(raw)
        write(self.fit/"fit-completion.json",complete)
        for name, value in {
            "FINAL_SHA":sha(self.source.read_bytes()), "DEV_SHA":sha(f.dev.read_bytes()),
            "RESERVATION_SHA":f.dev_document["sidecars"]["final-reservations.json"],
            "HEAD_SHA":sha((self.fit/"research_head_v3.json").read_bytes()),
            "PARAM_SHA":self.head["provenance"]["frozenParametersAndRulesSha256"],
            "COMPLETION_SHA":sha((self.fit/"fit-completion.json").read_bytes()),
            "CHROME_SHA":sha(f.reference.read_bytes()), "COUNTS":dict(Counter(r["label"] for r in source["records"])),
            "QUALITY_HARNESS":{n:sha((compare.ROOT/"ml/browser"/n).read_bytes()) for n in compare.HARNESS},
        }.items():
            p = patch.object(compare,name,value);p.start();self.addCleanup(p.stop)
        self.staged_path=Path(f.final_batch.staged_manifest_path)
        self.staged=json.loads(self.staged_path.read_bytes())
        self.quality_path=self.root/"quality.json";self.baseline_path=self.root/"baseline.json"
        (self.root/"source").mkdir()
        for name in compare.HARNESS:
            (self.root/"source"/name).write_bytes((compare.ROOT/"ml/browser"/name).read_bytes())
        self.quality=self.make_quality();write(self.quality_path,self.quality)
        self.baseline=self.make_baseline();write(self.baseline_path,self.baseline)
        browser={"userAgent":"Synthetic Chrome/144.0","platform":"Synthetic","hardwareConcurrency":4,"language":"en-US"}
        self.browser_path=self.root/"browser.json";self.qbrowser_path=self.root/"quality-browser.json"
        write(self.browser_path,{"schemaVersion":1,"qualityContractSha256":self.quality["contractSha256"],"baselineContractSha256":self.baseline["contractSha256"],"browser":browser,"capturePhase":"before-baseline-classification","promotionAllowed":False})
        write(self.qbrowser_path,{"schemaVersion":1,"browser":{**browser,"timeOrigin":1000,"qualityContractSha256":self.quality["contractSha256"],"phase":"complete","completed":6},"capturePhase":"quality-complete-before-either-classifier","promotionAllowed":False})

    def contract(self, phase):
        remote=[{"index":i,"url":f"https://huggingface.co/Xenova/clap-htsat-unfused/resolve/{compare.REVISION}/{name}",**pin} for i,(name,pin) in enumerate(compare.REMOTE.items())]
        remote += [{"index":len(compare.REMOTE)+i,"url":f"https://cdn.jsdelivr.net/npm/onnxruntime-web@{compare.ORT_VERSION}/dist/{name}",**pin} for i,(name,pin) in enumerate(compare.RUNTIME.items())]
        return {"schemaVersion":1,"implementation":"tw-legacy-website-baseline-v1","mode":"final","phase":phase,"protocol":compare.PROTOCOL,"manifestSha256":sha(self.staged_path.read_bytes()),"sourceManifestSha256":compare.FINAL_SHA,"distAssets":compare.DIST,"labels":list(compare.LABELS),"deployedOrigin":"https://tonalwatch.vercel.app","resamplerSha256":"2ab0e2e2a8d3bbc8dc2d3608993c7b27c2df4726a20411e5054414f4223d0477","sourceHashes":{n:sha((compare.ROOT/"ml/browser"/n).read_bytes()) for n in compare.HARNESS},"environment":{"node":"synthetic","platform":"synthetic","architecture":"synthetic"},"execution":{**compare.EXECUTION,"executedInThisPhase":phase=="classify"},"qualityArtifactSha256":None if phase=="quality" else sha(self.quality_path.read_bytes()),"remoteArtifacts":[] if phase=="quality" else remote,"promotionAllowed":False}

    def checkpoint(self,row,digest):
        return {"schemaVersion":1,"row":row["row"],"clipId":row["clip_id"],"sourceSha256":row["source_sha256"],"pcmSha256":row["pcm_sha256"],"contractSha256":digest,"inputUnchanged":True}

    def make_quality(self):
        c=self.contract("quality");digest=sha(compact(c));rows=[]
        for row in self.staged["records"]:
            q=self.checkpoint(row,digest);q.update(outcome="quality-eligible",error=None,analysis={"algorithmVersion":"tw-screen-v2","sampleRateHz":48000,"sampleCount":240000,"durationSeconds":5,"frameCount":57,"qualityCodes":[]})
            rows.append({**row,"checkpoint":q})
        counts={"total":len(rows),"eligible":len(rows),"blocked":0,"error":0,"perClass":{r["label"]:{"total":1,"eligible":1,"blocked":0,"error":0} for r in rows}}
        return {"schemaVersion":1,"kind":"tw-legacy-common-quality-v1","contract":c,"contractSha256":digest,"records":rows,"counts":counts,"promotionAllowed":False}

    def make_baseline(self):
        c=self.contract("classify");digest=sha(compact(c));rows=[]
        for row,quality in zip(self.staged["records"],self.quality["records"]):
            q=self.checkpoint(row,digest)
            q.update(qualityArtifactSha256=sha(self.quality_path.read_bytes()),analysis=quality["checkpoint"]["analysis"],outcome="result",resampledPcmSha256=row["pcm_sha256"],rawResponse={"type":"result","sessionId":row["row"]+1,"result":{"status":"uncertain","reason":"weak-separation","rankings":[{"label":compare.LABELS[0],"score":.3},{"label":compare.LABELS[1],"score":.2}],"provisionalGatePassed":False,"modelId":"Xenova/clap-htsat-unfused","modelRevision":compare.REVISION,"preprocessing":{"originalSampleRateHz":48000,"originalSampleCount":240000,"observationSeconds":5,"modelSampleRateHz":48000,"modelInputSamples":240000,"processorSeconds":10,"padding":"zero-pad","configuredPadding":"repeatpad","featureBandHz":[50,14000]},"timing":{"modelLoadMs":1,"inferenceMs":2,"totalMs":3,"reusedModel":False}}})
            rows.append({**row,"checkpoint":q})
        return {"schemaVersion":1,"contract":c,"contractSha256":digest,"records":rows,"outcomeCounts":{"result":len(rows),"blocked-by-quality":0,"error":0},"promotionAllowed":False}

    def invoke(self):
        f=self.fixture
        return compare.compare(self.fit,self.source,self.staged_path,f.final_batch.embeddings_path,self.quality_path,self.baseline_path,self.output,
            quality_sha256=sha(self.quality_path.read_bytes()),baseline_sha256=sha(self.baseline_path.read_bytes()),embeddings_sha256=sha(Path(f.final_batch.embeddings_path).read_bytes()),qualification_comparison=f.comparison,qualification_embeddings=f.qualified.embeddings_path,qualification_staged_manifest=f.qualified.staged_manifest_path,golden_reference=f.reference,browser_evidence=self.browser_path,browser_evidence_sha256=sha(self.browser_path.read_bytes()),quality_browser_evidence=self.qbrowser_path,quality_browser_evidence_sha256=sha(self.qbrowser_path.read_bytes()))

    def test_browser_evidence_requires_both_contracts_and_same_measured_browser(self):
        browser=json.loads(self.browser_path.read_bytes())
        for field in ("userAgent","platform","hardwareConcurrency","language"):
            changed=deepcopy(browser);changed["browser"][field]="changed"
            write(self.browser_path,changed)
            with self.subTest(field=field),patch.object(compare,"predict_fixed_v3") as call,self.assertRaisesRegex(ValueError,"browser"):
                self.invoke()
            call.assert_not_called()
        changed=deepcopy(browser);changed["baselineContractSha256"]="a"*64;write(self.browser_path,changed)
        with patch.object(compare,"predict_fixed_v3") as call,self.assertRaisesRegex(ValueError,"browser/contract"):self.invoke()
        call.assert_not_called()

    def test_complete_evidence_precedes_single_prediction_and_output_immutable(self):
        original=compare.predict_fixed_v3
        def predict(*args,**kwargs):
            self.assertTrue((self.output/"comparison-input.json").exists())
            self.assertTrue((self.output/"inputs/quality-results.json").exists())
            # A concurrent mutable path cannot rewrite the checksum-bound
            # original strict failure after prediction has begun.
            live=json.loads((self.fit/"development_v3.json").read_bytes())
            live["developmentAudit"]["developmentAuditPassed"]=True
            write(self.fit/"development_v3.json",live)
            return original(*args,**kwargs) # Synthetic zero head only.
        with patch.object(compare,"predict_fixed_v3",side_effect=predict) as call:
            result=self.invoke();self.assertEqual(call.call_count,1)
            self.assertTrue(result.exists())
            report=json.loads((self.output/"comparison-results.json").read_bytes())
            self.assertFalse(report["originalDevelopmentStrictAudit"]["developmentAuditPassed"])
            self.assertEqual(len(report["records"]),6)
            with self.assertRaisesRegex(ValueError,"immutable"):self.invoke()
            self.assertEqual(call.call_count,1)

    def test_swapped_raw_top2_pcm_or_quality_rejected_before_prediction(self):
        original=deepcopy(self.baseline)
        for kind in ("top8","confidence","pcm","quality","order","gate","tie","boolean-session"):
            self.baseline=deepcopy(original);q=self.baseline["records"][0]["checkpoint"];r=q["rawResponse"]["result"]
            if kind=="top8":r["rankings"]*=4
            if kind=="confidence":r["status"]="confident"
            if kind=="pcm":q["resampledPcmSha256"]="a"*64
            if kind=="quality":q["analysis"]=dict(q["analysis"],qualityCodes=["clipped"])
            if kind=="order":self.baseline["records"].reverse()
            if kind=="gate":r["provisionalGatePassed"]=True
            if kind=="tie":r["rankings"]=[{"label":compare.LABELS[1],"score":.2},{"label":compare.LABELS[0],"score":.2}]
            if kind=="boolean-session":q["rawResponse"]["sessionId"]=True
            write(self.baseline_path,self.baseline)
            with self.subTest(kind=kind),patch.object(compare,"predict_fixed_v3") as call,self.assertRaises(ValueError):self.invoke()
            call.assert_not_called();self.assertFalse(self.output.exists())

    def test_quality_error_cannot_be_favorable_exclusion(self):
        self.quality["records"][0]["checkpoint"].update(outcome="quality-error",analysis=None,error="synthetic failure")
        write(self.quality_path,self.quality)
        with patch.object(compare,"predict_fixed_v3") as call,self.assertRaisesRegex(ValueError,"technical quality error"):self.invoke()
        call.assert_not_called();self.assertFalse(self.output.exists())

    def test_failure_keeps_frozen_inputs_and_refuses_retry(self):
        with patch.object(compare,"predict_fixed_v3",side_effect=RuntimeError("synthetic")),self.assertRaises(RuntimeError):self.invoke()
        self.assertTrue((self.output/"comparison-failed.json").exists())
        self.assertTrue((self.output/"comparison-input.json").exists())
        with patch.object(compare,"predict_fixed_v3") as call,self.assertRaisesRegex(ValueError,"immutable"):self.invoke()
        call.assert_not_called()

    def test_swapped_fit_artifact_and_source_record_fail_before_head(self):
        path=self.fit/"research_head_v3.json";original=path.read_bytes();path.write_bytes(original+b" ")
        with patch.object(compare,"predict_fixed_v3") as call,self.assertRaisesRegex(ValueError,"Fit artifact bytes changed"):self.invoke()
        call.assert_not_called();path.write_bytes(original)
        staged=json.loads(self.staged_path.read_bytes());staged["records"][0]["source_record"]["title"]="changed"
        write(self.staged_path,staged)
        with patch.object(compare,"predict_fixed_v3") as call,self.assertRaisesRegex(ValueError,"source records differ"):self.invoke()
        call.assert_not_called()


if __name__ == "__main__":unittest.main()
