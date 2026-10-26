import json
P=json.load(open('plan.json')); R=P['refs']
STILL={'S_shop':360201,'S_ad':360202,'S_travel':360203,'S_class':360204,'S_cat':360205,'S_dog':360206,'S_duo':360207}
TANK_V="young friendly female voice, clear and patient but lively, natural pace"
ME_V="warm, steady, confident male voice around 35 years old, natural pace"
ACT={'full':"warm eye contact, expressive face, natural hand gestures",
     'pip':"calm explaining tone, small nods, occasionally glancing down as if reading a screen, small pointing gestures"}
def lang_name(l): return {"Mandarin":"Mandarin Chinese"}.get(l,l)
def narr(r):
    if r['host']=='tank':
        ref=R['tank']; who=f"The young woman in @{ref} talks straight into her phone's front camera, same selfie framing, lighting and outfit as the reference, like a friendly tech vlogger presenting a tutorial"
        pron,v,ratio="She",TANK_V,"9:16"
    else:
        ref=R['me']; who=f"The man in @{ref} talks straight to the camera, same framing, gray studio backdrop, navy polo shirt, glasses and soft lighting as the reference, like a friendly tech blogger presenting a tutorial"
        pron,v,ratio="He",ME_V,"16:9"
    cam="Handheld selfie feel with only a very slight natural sway." if r['host']=='tank' else "Locked-off camera, no zoom."
    act=ACT['full' if r['shot']=='full' else 'pip']
    if r['id'].startswith('L_'): act="bright friendly greeting, a small wave at the start, warm smile"
    p=(f"{who}: {act}. {cam} {pron} speaks {lang_name(r['lang'])}, clearly lip-synced, in a {v}:\n“{r['t']}”\n"
       f"Sound: only {'her' if pron=='She' else 'his'} voice and quiet room tone, no music, no subtitles, no on-screen text.")
    return dict(label=f"{r['id']} {r['ch']}"[:48],model="grok-video-1.5",ratio=ratio,resolution=r['res'],duration=r['dur'],
                idempotencyKey=f"ep3-{r['id']}-v1",references=[{"ref":ref,"role":"reference_image"}],prompt=p)
SC={
 'S_shop':("The young woman in @task:360201 is a cheerful livestream shopping host: she holds the serum bottle up to the camera, then gestures toward it with her other hand, lively and persuasive, bright eyes, natural head movement. Static phone camera.","She","young bright energetic female voice, fast upbeat livestream-host pace"),
 'S_ad':("The man in @task:360202 presents the earbuds in a polished product commercial: he lifts the open case slightly toward the lens, confident smile, then a small nod. Slow gentle push-in.","He","confident, smooth male commercial voice-over tone"),
 'S_travel':("The young woman in @task:360203 is a travel vlogger filming herself in Gion at dusk, the lanterns glowing behind her; she glances back at the lane once, then smiles into the lens. Handheld selfie walk, very slight sway.","She","soft, cheerful young female voice, relaxed travel-vlog pace"),
 'S_class':("The man in @task:360204 is a teacher at the whiteboard: he taps the diagram with the marker, then turns to the camera and explains with a friendly open-hand gesture. Static camera.","He","warm, clear male teacher voice, steady pace"),
 'S_cat':("The orange cat in @task:360205 talks to the camera like a shop manager presenting a product: its mouth clearly opens and closes in sync with the words, ears twitch, it pats the can of cat food with one paw, cute expressive face. Static camera.","It","cute, playful small high-pitched voice"),
 'S_dog':("The Shiba Inu in @task:360206 reads the evening news like a TV anchor: its mouth clearly opens and closes in sync with the words, serious expression, a slight head tilt at the end. Static broadcast camera.","It","deep, serious male TV news-anchor voice"),
 'S_duo':("The woman and the man in @task:360207 co-host the ending of a show: she speaks the line to the camera while he smiles and nods; at the very end both wave goodbye together. Static camera.","She","young friendly female voice, clear and patient but lively, natural pace"),
}
def scene(r):
    a,pron,v=SC[r['id']]
    p=(f"{a} {pron} speaks {lang_name(r['lang'])}, clearly lip-synced, in a {v}:\n“{r['t']}”\n"
       "Sound: only the voice and quiet room tone, no music, no subtitles, no on-screen text.")
    return dict(label=f"{r['id']} {r['scene']}"[:48],model="grok-video-1.5",ratio=r['ratio'],resolution="720p",duration=r['dur'],
                idempotencyKey=f"ep3-{r['id']}-v1",references=[{"ref":f"task:{STILL[r['id']]}","role":"reference_image"}],prompt=p)
T=[]
for r in P['new']:
    if r['id']=='u1': continue
    T.append(scene(r) if r['shot']=='scene' else narr(r))
json.dump(T,open('tasks_all.json','w'),ensure_ascii=False,indent=1)
for i in range(0,len(T),10): json.dump(T[i:i+10],open(f'tasks_b{i//10+1}.json','w'),ensure_ascii=False)
print(len(T), sum(t['duration']*(17 if t['resolution']=='720p' else 10) for t in T))
print(T[0]['prompt']); print(T[-1]['prompt'])
