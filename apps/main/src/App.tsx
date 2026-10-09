import {Routes, Route} from 'react-router-dom'
import {CommonLayout} from '@whitepoint/ui/layout'
import { Navbar } from './components/layout/mainNavbar'

import * as Pages from './pages'
import { Footer } from './components/layout/footer'
import { PageSeo } from './components/seo/PageSeo'

function App() {
  return (
    <>
      <PageSeo />
      <Routes>
        <Route element={<CommonLayout navbar={<Navbar />} footer={<Footer />} />}>
          <Route path="/" element={<Pages.HomeV2 />} />
          <Route path="/services" element={<Pages.Services />} />
          <Route path="/services/:slug" element={<Pages.ServiceDetail />} />
          <Route path="/contact" element={<Pages.ContactV2 />} />
          <Route path="/company" element={<Pages.Company />} />
          <Route path="/services/discounts" element={<Pages.Discount />} />
          <Route path="/terms-of-service" element={<Pages.TermsOfService />} />
          <Route path="/eula" element={<Pages.Eula />} />
          <Route path="/privacy-policy" element={<Pages.Privacy />} />
          <Route path="/positions" element={<Pages.Positions />} />
          <Route path="/positions/:id" element={<Pages.JobDetail />} />

          <Route path="*" element={<Pages.ErrorPage />} />
          <Route path="/404" element={<Pages.ErrorPage />} />
        </Route>
        <Route path="/sitemap.xml" />
      </Routes>
    </>
  )
}

export default App
