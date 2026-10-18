import hashlib,json,tempfile,unittest
from pathlib import Path
import numpy as np
import soundfile as sf
from ml.browser.prepareCanonical import prepare

class CanonicalPreparationTests(unittest.TestCase):
    def write_case(self, directory, rate=48000, seconds=5, value=None):
        values=(.1*np.sin(np.arange(int(rate*seconds))*.1)).astype('float32') if value is None else np.full(int(rate*seconds),value,dtype='float32')
        audio=directory/'input.wav';sf.write(audio,values,rate,subtype='FLOAT')
        record={'clip_id':'generated','label':'synthetic','split':'val','uploader':'generated','local_path':str(audio),'sha256':hashlib.sha256(audio.read_bytes()).hexdigest()}
        manifest=directory/'input.json';manifest.write_text(json.dumps({'records':[record]}))
        return audio,manifest,record,values

    def test_float_pcm_is_exact_and_portable_without_gain_or_resampling(self):
        for rate in (44100,48000):
            with self.subTest(rate=rate),tempfile.TemporaryDirectory() as temporary:
                directory=Path(temporary);audio,source,record,values=self.write_case(directory,rate,6)
                before=audio.read_bytes();result=json.loads(prepare(source,directory/'staged').read_text());row=result['records'][0]
                self.assertFalse(Path(row['pcm_path']).is_absolute())
                actual=(directory/'staged'/row['pcm_path']).read_bytes()
                self.assertEqual(actual,values[:rate*5].astype('<f4').tobytes());self.assertEqual(row['pcm_sha256'],hashlib.sha256(actual).hexdigest());self.assertEqual(audio.read_bytes(),before)
                self.assertEqual(row['label'],'synthetic');self.assertEqual(row['split'],'val')

    def test_rejects_changed_source_and_duplicate_ids(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory=Path(temporary);audio,source,record,_=self.write_case(directory)
            source.write_text(json.dumps({'records':[record,record]}))
            with self.assertRaisesRegex(ValueError,'Duplicate'):prepare(source,directory/'duplicate')
            record['sha256']='0'*64;source.write_text(json.dumps({'records':[record]}))
            with self.assertRaisesRegex(ValueError,'SHA'):prepare(source,directory/'mismatch')

    def test_rejects_short_unsupported_clipped_nonfinite_and_silent(self):
        for rate,seconds,value in [(48000,4,None),(32000,5,None),(48000,5,.9999),(48000,5,np.nan),(48000,5,0)]:
            with self.subTest(rate=rate,seconds=seconds,value=value),tempfile.TemporaryDirectory() as temporary:
                directory=Path(temporary);_,source,_,_=self.write_case(directory,rate,seconds,value)
                with self.assertRaises(ValueError):prepare(source,directory/'staged')

if __name__=='__main__':unittest.main()
