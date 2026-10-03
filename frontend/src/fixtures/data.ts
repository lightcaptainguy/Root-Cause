// Explicit development fixtures; never used as a fallback for live requests.
import type { AnalysisJob, AnalysisResult, AttentionItem, ChatResponse, Health, Observation, ObservationMetadata, Zone } from '../types/contracts';
export const FIXTURE_ZONES: Zone[] = [{id:'zone-1',name:'Fixture North'},{id:'zone-2',name:'Fixture South'},{id:'zone-3',name:'Fixture Empty'}];
export const FIXTURE_HEALTH: Health = {status:'ok',vision_ready:true,ollama_ready:true,capabilities:{classification:true,experimental_overlays:true,localization:false,segmentation:false}};
let observationCounter = 3;
const source = {kind:'simulated' as const,name:'Development fixture',reference:null};
function makeObservation(zoneId:string, overrides:Partial<Observation> = {}):Observation {
 return {id:'obs-fixture-'+(++observationCounter),zone_id:zoneId,captured_at:null,received_at:new Date().toISOString(),
 image_kind:'closeup_leaf',crop_hint:null,source,measurements:[],notes:'Simulated fixture, not measured evidence.',
 image:{url:'/fixtures/leaf_landscape.png',width:640,height:480},association:{status:'unassociated',method:null,deltas_ms:{}},latest_result_id:null,...overrides};
}
export const FIXTURE_OBSERVATIONS:Record<string,Observation[]> = {
 'zone-1':[makeObservation('zone-1',{id:'obs-fixture-1',latest_result_id:'result-fixture-1'}),makeObservation('zone-1',{id:'obs-fixture-2',image_kind:'aerial',image:{url:'/fixtures/aerial.png',width:640,height:480}})],
 'zone-2':[makeObservation('zone-2',{id:'obs-fixture-3'})], 'zone-3':[]
};
export function createFixtureResult(observationId:string, resultId = 'result-fixture-1'):AnalysisResult {
 const obs = Object.values(FIXTURE_OBSERVATIONS).flat().find(o=>o.id===observationId);
 if (!obs) throw new Error('Fixture observation not found');
 const unsupported = obs.image_kind !== 'closeup_leaf';
 return {id:resultId,observation_id:observationId,created_at:new Date().toISOString(),status:unsupported?'unsupported':'partial',
 classification:{status:unsupported?'unsupported':'available',crop:unsupported?null:'Tomato',label:unsupported?null:'Tomato___Late_blight',score:unsupported?null:0.87,model_id:unsupported?null:'simulated-fixture'},
 localization:{status:'unavailable',method:null,boxes:[]},
 segmentation:{status:'unavailable',method:null,mask_url:null,affected_fraction:null,denominator:null},metrics:[],
 attention:{status:unsupported?'unknown':'attention',reasons:unsupported?[]:['Simulated disease prediction'],rule_version:'fixture'},
 limitations:['Simulated development response. No sensor measurements or validated area estimates.'],timings_ms:{queue:0,inference:0,total:0}};
}
export const FIXTURE_RESULTS:Record<string,AnalysisResult> = {'result-fixture-1':createFixtureResult('obs-fixture-1')};
export const FIXTURE_ATTENTION:Record<string,AttentionItem[]> = {'zone-1':[{observation_id:'obs-fixture-1',zone_id:'zone-1',...FIXTURE_RESULTS['result-fixture-1'].attention}], 'zone-2':[], 'zone-3':[]};
let jobCounter = 0;
export function createFixtureJob(observationId:string):AnalysisJob {return {id:'job-fixture-'+(++jobCounter),observation_id:observationId,status:'queued',result_id:null,error:null};}
export function advanceFixtureJob(job:AnalysisJob):AnalysisJob {
 if(job.status==='queued') return {...job,status:'running'};
 if(job.status==='running') return {...job,status:'completed',result_id:'result-'+job.id};
 return job;
}
export function createFixtureChatResponse(message:string,_zoneId:string|null,observationId:string|null,conversationId:string):ChatResponse {
 return {conversation_id:conversationId,answer:'Simulated fixture explanation: '+message,evidence:observationId?[{kind:'observation',id:observationId,title:'Simulated observation',observation_id:observationId,result_id:null}]:[],limitations:['Development fixture; no local AI inference.']};
}
export function createFixtureObservation(metadata:ObservationMetadata):Observation {return makeObservation(metadata.zone_id,{...metadata});}
