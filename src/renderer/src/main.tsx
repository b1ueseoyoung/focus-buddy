import {createRoot} from 'react-dom/client';
import FocusApp from './focus/FocusApp';
import './reset.css';
const root=document.getElementById('root');
if(!root)throw new Error('Missing application root');
createRoot(root).render(<FocusApp/>);
