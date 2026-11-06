import {muscleWorkReport} from '../mycoatch/muscleWorkReport.js';
import {renderMuscleWorkDetails} from './muscleWorkUI.js';
export function createSessionMusclesPanel(day,{open=false}={}){
 const details=document.createElement('details');details.className='session-muscle-details';details.open=open;
 const summary=document.createElement('summary');summary.textContent='Muscoli coinvolti';details.append(summary);
 const anchor=document.createElement('div');details.append(anchor);
 renderMuscleWorkDetails(anchor,muscleWorkReport([day]),{scope:'session',expanded:true});
 return details;
}
