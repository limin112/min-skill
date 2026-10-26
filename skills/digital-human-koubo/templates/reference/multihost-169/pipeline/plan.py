import json, math
P={("720p"):17,("480p"):10}
def d(t): return min(15, math.ceil(len(t)/5.4+1))
# host: tank=白背心(9:16, material:329814)  me=用户本人(16:9, me_polo.jpg)
NEW=[
 # 冷开场：多语言快闪（也用于「升级一」六宫格）
 ("L_en","冷开场","tank","full","Hi! I'm an AI digital human, and I can speak your language.",5,"English"),
 ("L_ja","冷开场","tank","full","こんにちは！私はAIデジタルヒューマンです。",5,"Japanese"),
 ("L_ko","冷开场","tank","full","안녕하세요! 저는 AI 디지털 휴먼이에요.",5,"Korean"),
 ("L_fr","冷开场","tank","full","Bonjour ! Je suis une humaine numérique créée par l'IA.",5,"French"),
 ("L_es","冷开场","me","full","¡Hola! Soy un humano digital hecho con IA.",5,"Spanish"),
 ("L_ar","冷开场","me","full","مرحباً! أنا إنسان رقمي صنعه الذكاء الاصطناعي.",5,"Arabic"),
 ("t1","开场","tank","full","上一期，我教你做出了我。这一期升级：让数字人说外语、进场景、换角色，还请来一位新同事。",None,"Mandarin"),
 ("t2","开场","tank","full","老规矩，先用一分半钟，把基础三步过一遍。",None,"Mandarin"),
 ("t3","基础·声音","tank","pip","上期还留了一个坑：换了声音，口型就对不准。接下来，请我的同事接棒。",None,"Mandarin"),
 ("u1","换人","me","full","大家好，我是她的同事，也是数字人。不一样的是，我是用我本人的一张照片做的。",None,"Mandarin"),
 ("u2","换人","me","full","你看这张照片：横屏、正脸、背景干净。横屏照片，直接就能生成横屏口播。",None,"Mandarin"),
 ("u3","换人","me","pip","先说那个坑。Grok 的口型，跟的是它自己的声音。所以最稳的做法，是直接让它用目标语言开口。",None,"Mandarin"),
 ("u4","换人","me","pip","如果一定要用你自己的录音，就换一个音频驱动口型的模型，比如 OmniHuman：一张照片，加一段录音。",None,"Mandarin"),
 ("u5","升级①多语言","me","full","升级一，多语言。想让数字人说英语、日语、韩语，只要在提示词里写清楚语言，台词直接用那门语言写。",None,"Mandarin"),
 ("u6","升级①多语言","me","pip","注意，别写中文让它自己翻，要提前翻好。生成完，再用语音识别回听一遍，确认没念错。",None,"Mandarin"),
 ("u7","升级②进场景","me","full","升级二，进场景。同一个数字人，可以去直播间带货、拍产品广告、做旅游导览、当讲师。",None,"Mandarin"),
 ("u8","升级②进场景","me","pip","方法是两步。第一步，把人物照片和场景描述一起发给图片模型，合成一张开场画面。",None,"Mandarin"),
 ("u9","升级②进场景","me","pip","比如：让她站在直播间里，手里拿着一瓶精华。人物不变，只换背景、服装和道具。",None,"Mandarin"),
 ("u10","升级②进场景","me","pip","第二步，把这张画面交给 Grok，写好台词，它就开口了。我们来看看效果。",None,"Mandarin"),
 ("u11","升级②进场景","me","pip","带货、广告、导览、讲课，一张照片全搞定。商用之前，记得标注 AI 生成。",None,"Mandarin"),
 ("t4","升级③换角色","tank","full","升级三，换角色。谁说数字人一定是人？小猫小狗，也能开口。",None,"Mandarin"),
 ("t5","升级③换角色","tank","pip","做法一样：先生成角色形象，再写台词。提示词里写清楚，是这只猫在说话，嘴巴要跟着动。",None,"Mandarin"),
 ("u12","流程","me","full","最后，把这些串成一条片子。还是那套流程：脚本、Skill、剪辑。",None,"Mandarin"),
]
SCENES=[ # 先 GPT Image 合成开场画面，再 Grok 开口
 ("S_shop","tank","9:16",8,"直播间带货","家人们看过来！这瓶精华一滴就能推开，今天直播间下单，再送小样！","Mandarin"),
 ("S_ad","me","16:9",6,"产品广告","Forty hours of battery. Zero cables. Just press play.","English"),
 ("S_travel","tank","9:16",7,"旅游导览（京都）","ここは京都の祇園です。夜の提灯、とてもきれいでしょう？","Japanese"),
 ("S_class","me","16:9",7,"课程讲师","今天这节课，我们用三分钟，搞懂什么是大语言模型。","Mandarin"),
 ("S_cat","cat","9:16",7,"橘猫店长带货猫粮","喵～这罐猫粮，本喵亲自试吃过，好吃到舔盘！","Mandarin"),
 ("S_dog","dog","16:9",7,"柴犬新闻主播","Good evening. Breaking news: the park is now open for belly rubs.","English"),
 ("S_duo","duo","16:9",9,"结尾：两位同框","照片、语言、场景、角色，你想到的，数字人都能演。去组建你自己的数字人团队吧，下期见！","Mandarin"),
]
REUSE=["s1a","s1b","s1c","s1d","s1e","s2a","s2b","s2c","s2d","s2e","s3a","s3b","s4b","s4c","s4d","s6b","s6c","s7b","s7c"]
rows=[];tot=0
for i,ch,h,shot,t,dur,lang in NEW:
    dur=dur or d(t); res="720p" if shot=="full" else "480p"; c=dur*P[res]; tot+=c
    rows.append(dict(id=i,ch=ch,host=h,shot=shot,t=t,dur=dur,res=res,lang=lang,cost=c))
img=0
for i,h,r,dur,name,t,lang in SCENES:
    c=dur*17; tot+=c; img+=23
    rows.append(dict(id=i,ch="场景" if i!="S_duo" else "结尾",host=h,shot="scene",ratio=r,scene=name,t=t,dur=dur,res="720p",lang=lang,cost=c))
tot+=img
json.dump(dict(new=rows,reuse=REUSE,image_cost=img,total=tot),open("plan.json","w"),ensure_ascii=False,indent=1)
nv=sum(r["dur"] for r in rows)
print("新生成口播/片段",len(rows),"段",nv,"秒；视频",tot-img,"图片",img,"合计",tot)
import collections
for k in ["tank","me","cat","dog","duo"]:
    print(k, sum(r["cost"] for r in rows if r["host"]==k), sum(r["dur"] for r in rows if r["host"]==k),"s")
