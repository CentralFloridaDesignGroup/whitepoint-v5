import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { PayInvoicePage } from './pages/PayInvoicePage'
import './index.css'

const router = createBrowserRouter([{ path: '/pay/:token', element: <PayInvoicePage /> }, { path: '*', element: <main className="mx-auto max-w-xl p-8">Payment link not found.</main> }])
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><RouterProvider router={router} /></React.StrictMode>)
