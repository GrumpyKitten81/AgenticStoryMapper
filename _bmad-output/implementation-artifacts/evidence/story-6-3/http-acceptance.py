import urllib.request, urllib.error, json
from pathlib import Path
base='http://127.0.0.1:44363'
def req(path,body=None):
 r=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(r) as response:return response.status,json.load(response)
 except urllib.error.HTTPError as error:return error.code,json.load(error)
def snapshot():return req('/api/story-maps/'+mapid)[1]
mapid=req('/api/story-maps')[1]['storyMaps'][0]['id']
s=snapshot(); activity=next(c for c in s['cards'] if c['level']=='activity'); step=next(c for c in s['cards'] if c['level']=='step'); story=next(c for c in s['cards'] if c['level']=='story')
records=[]
for c,parent in [(story,activity),(step,step)]:
 before=snapshot()['cards'];code,result=req('/api/cards/'+c['id']+'/move',{'parentId':parent['id'],'position':0,'baseVersion':c['version']})
 assert code==400 and snapshot()['cards']==before,(code,result)
 records.append({'case':'illegal '+c['level']+' under '+parent['level'],'status':code,'message':result['message']})
code,moved=req('/api/cards/'+story['id']+'/move',{'parentId':None,'position':1,'releaseId':None,'baseVersion':story['version']});assert code==200,(code,moved)
code,conflict=req('/api/cards/'+story['id']+'/move',{'parentId':step['id'],'position':0,'releaseId':story['releaseId'],'baseVersion':story['version']});assert code==409,(code,conflict)
code,restored=req('/api/cards/'+story['id']+'/move',{'parentId':step['id'],'position':0,'releaseId':story['releaseId'],'baseVersion':moved['version']});assert code==200
records.append({'case':'legal + stale second client + legal return','versions':[story['version'],moved['version'],restored['version']],'staleStatus':409})
def create(level,title,parent):
 code,c=req('/api/cards',{'storyMapId':mapid,'level':level,'title':title,'parentId':parent});assert code==200 or code==201,(code,c);return c
newstep=create('step',step['title'],activity['id']);newstory=create('story',story['title'],newstep['id']);note=create('note',story['title'],newstep['id'])
s=snapshot(); command={'storyMapId':mapid,'cards':[{'id':c['id'],'baseVersion':c['version']} for c in [newstep,newstory]],'affectedCards':[{'id':c['id'],'baseVersion':c['version']} for c in s['cards']],'strategy':'unassign'}
code,result=req('/api/cards/delete-set',command);assert code==200,(code,result)
s=snapshot();assert not any(c['id'] in [newstep['id'],newstory['id']] for c in s['cards']);survivor=next(c for c in s['cards'] if c['id']==note['id']);assert survivor['parentId'] is None and survivor['version']==2,survivor
records.append({'case':'atomic overlap deletes explicit targets only','status':code,'deleted':result['cardIds'],'survivorId':note['id'],'survivorParent':None,'survivorVersion':2})
evidence={'runtime':'Node24.17.0','surface':'actual TCP HTTP; isolated temporary built-in sample','mapId':mapid,'projectId':s['storyMap']['projectId'],'records':records,'restartExpected':{'storyId':story['id'],'version':restored['version'],'parentId':step['id'],'releaseId':story['releaseId'],'survivorId':note['id'],'deletedIds':[newstep['id'],newstory['id']]}}
Path('_bmad-output/implementation-artifacts/evidence/story-6-3/http-acceptance.json').write_text(json.dumps(evidence,indent=2)+'\n')
print(json.dumps(records))
