import type { CaseActionDraft, CaseActionEntry, CaseActionWorkflow } from '../src/community/caseWorkflowTypes.js';
import { CASE_ACTION_STATUSES } from '../src/community/caseWorkflowTypes.js';
import { CASE_CAPABILITY, storedCase, storedCaseObservation } from './caseValidation.js';
import { CommunityError, UUID, exactFields, requireValue, sha256 } from './communityValidation.js';

const FIELDS=['status','actionDescription','responsibleContact','responseSummary','targetDate','implementedDate','baselineObservationId','recheckObservationId','outcomeNotes'];
function text(value:unknown,max:number):string{requireValue(typeof value==='string');const clean=value.trim();requireValue(clean.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(clean));return clean;}
function day(value:unknown):string|null{if(value===null)return null;requireValue(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value,'Use a valid calendar date.');return value;}
export function normalizeCaseAction(value:unknown,now:number):CaseActionDraft{
 exactFields(value,FIELDS);requireValue(CASE_ACTION_STATUSES.includes(value.status as CaseActionDraft['status']));
 const id=(v:unknown)=>{requireValue(v===null||typeof v==='string'&&UUID.test(v));return typeof v==='string'?v.toLowerCase():null;};
 const result:CaseActionDraft={status:value.status as CaseActionDraft['status'],actionDescription:text(value.actionDescription,500),responsibleContact:text(value.responsibleContact,120),responseSummary:text(value.responseSummary,500),targetDate:day(value.targetDate),implementedDate:day(value.implementedDate),baselineObservationId:id(value.baselineObservationId),recheckObservationId:id(value.recheckObservationId),outcomeNotes:text(value.outcomeNotes,500)};
 requireValue(!result.implementedDate||result.implementedDate<=new Date(now).toISOString().slice(0,10),'A reported completed change cannot have a future date.');
 requireValue(!result.baselineObservationId||result.baselineObservationId!==result.recheckObservationId,'Choose different baseline and recheck observations.');
 if(['implemented','rechecking','improved','continues'].includes(result.status))requireValue(result.actionDescription&&result.implementedDate,'Describe the reported change and its completion date.');
 if(['improved','continues'].includes(result.status))requireValue(result.baselineObservationId&&result.recheckObservationId,'Select a linked baseline and a different recheck observation.');
 return result;
}
export function storedWorkflow(raw:unknown,id:string,now:number):CaseActionWorkflow|null{
 if(raw===null||raw===false)return null;
 try{
  requireValue(typeof raw==='string');const v:unknown=JSON.parse(raw);exactFields(v,['schemaVersion','caseId','revision','current','history']);
  requireValue(v.schemaVersion===1&&v.caseId===id&&Number.isSafeInteger(v.revision)&&Number(v.revision)>=1&&Number(v.revision)<=1_000_000&&Array.isArray(v.history)&&v.history.length<=20);
  const entry=(input:unknown):CaseActionEntry=>{exactFields(input,[...FIELDS,'revision','updatedAtUtc','provenance']);requireValue(Number.isSafeInteger(input.revision)&&Number(input.revision)>=1&&Number(input.revision)<=Number(v.revision)&&input.provenance==='organizer-self-reported'&&typeof input.updatedAtUtc==='string'&&new Date(input.updatedAtUtc).toISOString()===input.updatedAtUtc&&Date.parse(input.updatedAtUtc)<=now+300_000);const draft=Object.fromEntries(FIELDS.map(k=>[k,input[k]]));return {...normalizeCaseAction(draft,now),revision:Number(input.revision),updatedAtUtc:input.updatedAtUtc,provenance:'organizer-self-reported'};};
  const current=entry(v.current),history=v.history.map(entry);requireValue(current.revision===v.revision&&history.length===Math.min(Number(v.revision),20)&&history.every((e,i)=>e.revision===Number(v.revision)-history.length+i+1)&&JSON.stringify(current)===JSON.stringify(history[history.length-1]));
  return {schemaVersion:1,caseId:id,revision:Number(v.revision),current,history};
 }catch{throw new CommunityError(503,'unavailable','The case action history is temporarily unavailable.');}
}

export const CASE_WORKFLOW_READ_SCRIPT=`-- TW_CASE_WORKFLOW_READ_V1
local count=redis.call('INCR',KEYS[3]);if count==1 then redis.call('EXPIRE',KEYS[3],90) end
if count>120 then return {'rate'} end
local row=redis.call('HGET',KEYS[1],ARGV[1]);if not row then return {'missing'} end
return {'workflow',row,redis.call('GET',KEYS[2]) or false}`;

export const CASE_WORKFLOW_INSPECT_SCRIPT=`-- TW_CASE_WORKFLOW_INSPECT_V1
local count=redis.call('INCR',KEYS[6]);if count==1 then redis.call('EXPIRE',KEYS[6],3700) end
if count>60 then return {'rate'} end
local row=redis.call('HGET',KEYS[1],ARGV[1]);if not row then return {'missing'} end
local ok,data=pcall(cjson.decode,row);if not ok or type(data)~='table' then return {'invalid'} end
if data.deleteTokenHash~=ARGV[2] then return {'denied'} end
local previous=redis.call('GET',KEYS[5]);if previous then
 local valid,p=pcall(cjson.decode,previous);if not valid then return {'invalid'} end
 if p.requestHash~=ARGV[3] then return {'request-conflict'} end
 return {'replayed',row,p.workflow}
end
local refs={}
for i=4,5 do if ARGV[i]~='' then
 if redis.call('SISMEMBER',KEYS[3],ARGV[i])~=1 then return {'reference-missing'} end
 local obs=redis.call('HGET',KEYS[4],ARGV[i]);if not obs then return {'reference-missing'} end
 table.insert(refs,{ARGV[i],obs})
end end
return {'inspected',row,redis.call('GET',KEYS[2]) or false,refs}`;

export const CASE_WORKFLOW_UPDATE_SCRIPT=`-- TW_CASE_WORKFLOW_UPDATE_V1
local row=redis.call('HGET',KEYS[1],ARGV[1]);if not row then return {'missing'} end
local ok,data=pcall(cjson.decode,row);if not ok or type(data)~='table' then return {'invalid'} end
if data.deleteTokenHash~=ARGV[2] then return {'denied'} end
local previous=redis.call('GET',KEYS[5]);if previous then
 local valid,p=pcall(cjson.decode,previous);if not valid then return {'invalid'} end
 if p.requestHash~=ARGV[3] then return {'request-conflict'} end
 return {'replayed',p.workflow}
end
if row~=ARGV[4] then return {'conflict'} end
local old=redis.call('GET',KEYS[2]) or '';if old~=ARGV[5] then return {'conflict'} end
local refs=cjson.decode(ARGV[7]);for _,ref in ipairs(refs) do
 if redis.call('SISMEMBER',KEYS[3],ref[1])~=1 or redis.call('HGET',KEYS[4],ref[1])~=ref[2] then return {'reference-missing'} end
end
redis.call('SET',KEYS[2],ARGV[6]);redis.call('SET',KEYS[5],cjson.encode({requestHash=ARGV[3],workflow=ARGV[6]}),'EX',604800)
return {'updated',ARGV[6]}`;

export interface WorkflowContext {evalRedis:(script:string,keys:string[],args:string[])=>Promise<unknown[]>;rows:string;observationRows:string;prefix:string;readBucket:string;writeBucket:string;now:number}
function failure(tag:unknown):never{
 if(tag==='rate')throw new CommunityError(429,'rate-limited','The case action request limit was reached.');
 if(tag==='missing')throw new CommunityError(404,'not-found','That case is unavailable or was removed.');
 if(tag==='denied')throw new CommunityError(404,'not-found','That case cannot be updated with this organizer capability.');
 if(tag==='conflict')throw new CommunityError(409,'workflow-conflict','The action plan changed. Reload it before saving your changes.');
 if(tag==='request-conflict')throw new CommunityError(409,'idempotency-conflict','This request ID was already used with different reviewed details.');
 if(tag==='reference-missing')throw new CommunityError(409,'observation-unavailable','Choose existing public observations linked to this case.');
 throw new CommunityError(503,'unavailable','The case action history could not be confirmed. Retry the identical request.');
}
export async function getCaseWorkflow(context:WorkflowContext,id:string):Promise<{workflow:CaseActionWorkflow|null}>{
 const r=await context.evalRedis(CASE_WORKFLOW_READ_SCRIPT,[context.rows,context.prefix+'workflow:'+id,context.readBucket],[id]);
 if(r[0]!=='workflow')failure(r[0]);requireValue(storedCase(r[1],context.now).case.id===id);
 return {workflow:storedWorkflow(r[2],id,context.now)};
}
export async function updateCaseWorkflow(context:WorkflowContext,body:unknown):Promise<{workflow:CaseActionWorkflow}>{
 exactFields(body,['action','caseId','deleteToken','expectedRevision','requestId','draft','consent','website']);
 requireValue(body.action==='workflow'&&typeof body.caseId==='string'&&UUID.test(body.caseId)&&typeof body.deleteToken==='string'&&CASE_CAPABILITY.test(body.deleteToken)&&Number.isSafeInteger(body.expectedRevision)&&Number(body.expectedRevision)>=0&&Number(body.expectedRevision)<1_000_000&&typeof body.requestId==='string'&&UUID.test(body.requestId)&&body.consent===true&&body.website==='');
 const id=body.caseId.toLowerCase(),draft=normalizeCaseAction(body.draft,context.now),proof=sha256(body.deleteToken),hash=sha256(JSON.stringify({caseId:id,expectedRevision:body.expectedRevision,draft}));
 const keys=[context.rows,context.prefix+'workflow:'+id,context.prefix+'members:'+id,context.observationRows,context.prefix+'workflow-request:'+id+':'+body.requestId.toLowerCase()];
 const first=await context.evalRedis(CASE_WORKFLOW_INSPECT_SCRIPT,[...keys,context.writeBucket],[id,proof,hash,draft.baselineObservationId??'',draft.recheckObservationId??'']);
 if(first[0]!=='inspected'&&first[0]!=='replayed')failure(first[0]);const entry=storedCase(first[1],context.now);requireValue(entry.case.id===id&&entry.deleteTokenHash===proof);
 if(first[0]==='replayed'){const previous=storedWorkflow(first[2],id,context.now);if(!previous)failure('invalid');return {workflow:previous};}
 const old=storedWorkflow(first[2],id,context.now);if((old?.revision??0)!==body.expectedRevision)failure('conflict');
 if(!Array.isArray(first[3])||first[3].length>2)failure('invalid');
 const selected=new Map<string,string>();
 for(const pair of first[3]){if(!Array.isArray(pair)||pair.length!==2)failure('invalid');const observation=storedCaseObservation(pair[1],context.now);if(observation.observation.id!==pair[0])failure('invalid');selected.set(observation.observation.id,observation.observation.capturedAtUtc);}
 const baseline=draft.baselineObservationId?selected.get(draft.baselineObservationId):undefined,recheck=draft.recheckObservationId?selected.get(draft.recheckObservationId):undefined;
 requireValue(!baseline||!recheck||baseline<=recheck,'Choose a recheck captured at or after the baseline. These are self-reported capture times.');
 requireValue(!draft.implementedDate||(!baseline||baseline.slice(0,10)<=draft.implementedDate)&&(!recheck||recheck.slice(0,10)>=draft.implementedDate),'Choose a baseline on or before the reported change date, and a recheck on or after it.');
 const revision=(old?.revision??0)+1,current:CaseActionEntry={...draft,revision,updatedAtUtc:new Date(context.now).toISOString(),provenance:'organizer-self-reported'};
 const workflow:CaseActionWorkflow={schemaVersion:1,caseId:id,revision,current,history:[...(old?.history??[]),current].slice(-20)};
 const result=await context.evalRedis(CASE_WORKFLOW_UPDATE_SCRIPT,keys,[id,proof,hash,first[1] as string,typeof first[2]==='string'?first[2]:'',JSON.stringify(workflow),JSON.stringify(first[3])]);
 if(result[0]!=='updated'&&result[0]!=='replayed')failure(result[0]);const saved=storedWorkflow(result[1],id,context.now);if(!saved)failure('invalid');return {workflow:saved};
}
