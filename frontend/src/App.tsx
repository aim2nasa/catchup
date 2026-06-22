import { useEffect, useState } from 'react'
import { SalesReportView } from '@/features/sales-report/SalesReportView'
import { HomeView } from '@/pages/HomeView'
import { ExcelOrderView } from '@/pages/ExcelOrderView'
import { ProductCodesView } from '@/pages/ProductCodesView'

type Route = 'home' | 'hardwax' | 'product-codes' | 'sales'

function parseRoute(): Route {
  const h = window.location.hash.replace(/^#/, '')
  if (h === 'hardwax') return 'hardwax'
  if (h === 'product-codes') return 'product-codes'
  if (h === 'sales') return 'sales'
  return 'home'
}

function App() {
  const [route, setRoute] = useState<Route>(parseRoute)

  useEffect(() => {
    const onHash = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (route === 'hardwax') return <ExcelOrderView />
  if (route === 'product-codes') return <ProductCodesView />
  if (route === 'sales') return <SalesReportView />
  return <HomeView />
}

export default App
