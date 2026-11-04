export const REST_SHORTCUT_NAME='Recupero palestra';
export function isAppleTouchDevice({userAgent='',platform='',maxTouchPoints=0}={}){
 return /iPhone|iPad|iPod/i.test(userAgent)||platform==='MacIntel'&&maxTouchPoints>1;
}
export function restShortcutUrl(remainingSeconds){
 if(typeof remainingSeconds!=='number'||!Number.isFinite(remainingSeconds)||remainingSeconds<=0||remainingSeconds>86400)return null;
 return 'shortcuts://run-shortcut?name='+encodeURIComponent(REST_SHORTCUT_NAME)+'&input=text&text='+Math.ceil(remainingSeconds);
}
