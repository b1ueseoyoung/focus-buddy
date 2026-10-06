import {useEffect} from 'react';
import {connectFocusBridge} from './store';
import {useSnoreEffects} from './snore-effects';
import {MainView} from './views/MainView';
import {MiniView} from './views/MiniView';
export default function FocusApp():JSX.Element{
  useSnoreEffects();
  useEffect(()=>{void connectFocusBridge();},[]);
  return location.hash==='#/mini'?<MiniView/>:<MainView/>;
}
