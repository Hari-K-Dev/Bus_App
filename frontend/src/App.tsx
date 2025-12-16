import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { Arrivals } from './pages/Arrivals';
import { LiveTracking } from './pages/LiveTracking';
import { LiveMap } from './pages/LiveMap';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/map" element={<LiveMap />} />
        <Route path="/arrivals/:stopId" element={<Arrivals />} />
        <Route path="/tracking/:trackingId" element={<LiveTracking />} />
      </Routes>
    </BrowserRouter>
  );
}
