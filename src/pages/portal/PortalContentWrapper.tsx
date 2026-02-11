import { useLocation } from 'react-router-dom';
import PortalMapPage from './PortalMapPage';
import PortalPipelinePage from './PortalPipelinePage';

/**
 * PortalContentWrapper - Keeps both Map and Pipeline views mounted
 *
 * This wrapper prevents the map from being unmounted/remounted when switching
 * between tabs, which preserves:
 * - Map center position
 * - Zoom level
 * - Layer visibility toggles
 * - Selected site submit and sidebar state
 *
 * Uses CSS display:none to hide inactive views while keeping them in the DOM.
 */
export default function PortalContentWrapper() {
  const location = useLocation();

  // Determine which view is active based on the current route
  const isMapActive = location.pathname === '/portal/map' || location.pathname === '/portal';
  const isPipelineActive = location.pathname === '/portal/pipeline';

  return (
    <>
      {/* Map view - always mounted, hidden when not active */}
      <div style={{ display: isMapActive ? 'block' : 'none', height: '100%' }}>
        <PortalMapPage />
      </div>

      {/* Pipeline view - always mounted, hidden when not active */}
      <div style={{ display: isPipelineActive ? 'block' : 'none', height: '100%' }}>
        <PortalPipelinePage />
      </div>
    </>
  );
}
