/** Group credits are accounting conventions (direct 1, secondary 0.5), not
 * measured effort, EMG percentages, recovery time or hypertrophy predictions.
 * Stabilizers are listed separately and receive no hypertrophy-set credits.
 * Reviewed against exercise mechanics; see docs/CATALOG_MUSCLES_2026-11-06.md.
 */
const frozen = values => Object.freeze([...values]);
const GROUP_NAMES = Object.freeze({
 Petto:'Pettorali',Back_Lats:'Gran dorsale e grande rotondo',
 Back_Thickness:'Trapezio medio e romboidi',Spalle:'Deltoidi',
 Quadricipiti:'Quadricipiti',Femorali:'Femorali',Glutei:'Glutei',
 Polpacci:'Polpacci',Bicipiti:'Flessori del gomito',Tricipiti:'Tricipiti',Core:'Addome e core'
});
export const muscleGroupLabel = group => GROUP_NAMES[group] || group;

export function auditedMuscleProfile(ex) {
 if(!GROUP_NAMES[ex.category])throw Error('Distretto non classificato: '+ex.name);
 const n=ex.name;let primary=[ex.category],secondary=[],stabilizers=[],regions=[];
 switch(ex.pattern){
  case 'horizontal_push':
   secondary=ex.category==='Tricipiti'?['Petto','Spalle']:['Tricipiti','Spalle'];
   regions=['Deltoide anteriore'];break;
  case 'vertical_push':
   secondary=ex.category==='Petto'?['Tricipiti','Spalle']:['Tricipiti'];
   regions=ex.category==='Spalle'?['Deltoide anteriore','Deltoide laterale']:['Deltoide anteriore'];break;
  case 'vertical_pull':secondary=['Bicipiti','Back_Thickness'];break;
  case 'horizontal_pull':secondary=['Bicipiti','Back_Lats','Spalle'];regions=['Deltoide posteriore'];break;
  case 'squat':secondary=['Glutei'];regions=['Adduttori dell’anca: coinvolgimento variabile, non quantificato'];break;
  case 'hinge':secondary=['Glutei'];break;
  case 'hip_thrust':secondary=/pull-through/i.test(n)?['Femorali']:[];break;
  case 'isolation':
   if(/alzate posteriori|face pull|reverse fly|reverse pec deck/i.test(n)){
    secondary=['Back_Thickness'];regions=['Deltoide posteriore'];
   }else if(/alzate laterali/i.test(n))regions=['Deltoide laterale'];
   break;
  default:throw Error('Movimento non classificato: '+n);
 }
 if(/stacco da terra convenzionale/i.test(n)){primary=['Glutei'];secondary=['Femorali','Quadricipiti'];}
 // Isometric trunk support is not a rowing set or direct abdominal training.
 if(ex.pattern==='hinge'||ex.pattern==='squat'||ex.name==='Rematore con Bilanciere')stabilizers=['Erettori spinali','Addome e core'];
 if(ex.name==='Military Press con Bilanciere')stabilizers=['Addome e core'];
 if(ex.name==='Hamstring Walkout a Corpo Libero')stabilizers=['Glutei','Addome e core'];
 if(ex.name==='Pallof Press ai Cavi')regions=['Obliqui: resistenza alla rotazione'];
 if(ex.name==='Face Pull ai Cavi')regions=['Deltoide posteriore','Rotatori esterni se viene eseguita extrarotazione'];
 if(/rematore unilaterale|rematore con manubrio a un braccio|pulley/i.test(n))stabilizers=['Addome e core'];
 if(/calf raise seduto/i.test(n))regions=['Soleo (enfasi)'];
 else if(ex.category==='Polpacci')regions=['Gastrocnemio e soleo'];
 if(ex.category==='Bicipiti')regions=/martello/i.test(n)?['Brachiale e brachioradiale (enfasi)','Bicipite brachiale']:['Bicipite brachiale','Brachiale'];
 if(ex.category==='Tricipiti')regions=/sopra la testa|french press|estensioni tricipiti con manubrio/i.test(n)?['Tutti i capi del tricipite; capo lungo a braccio elevato']:['Tutti i capi del tricipite'];
 return Object.freeze({primary:frozen(primary),secondary:frozen(secondary),stabilizers:frozen(stabilizers),regions:frozen(regions),directCredit:1,indirectCredit:0.5});
}
