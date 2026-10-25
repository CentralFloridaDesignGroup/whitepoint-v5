import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { PayInvoicePage } from './pages/PayInvoicePage'
import './index.css'
import { setPageMetadata } from '@whitepoint/utils/page-metadata'

function MissingPayment() {
  useEffect(() => setPageMetadata({ title: 'Payment link not found | White Point Survey', description: 'The payment link could not be found.', noindex: true }), [])
  return <main className="mx-auto max-w-xl p-8">Payment link not found.</main>
}

const router = createBrowserRouter([{ path: '/pay/:token', element: <PayInvoicePage /> }, { path: '*', element: <MissingPayment /> }])
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><RouterProvider router={router} /></React.StrictMode>)
