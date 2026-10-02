import { render } from 'preact';
import { App } from './app.tsx';
import { connection } from './connection.ts';
import './style.css';

connection.start();
render(<App />, document.getElementById('app')!);
