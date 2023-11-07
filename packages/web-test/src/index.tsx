import { createRoot } from 'react-dom/client'
import React from 'react'

import './index.css'
import App from './App.js'

createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
)
