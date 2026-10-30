import { RouterProvider } from 'react-router';
import { AuthProvider } from './context/AuthContext.jsx';
import { ConfirmProvider } from './context/ConfirmContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { create_app_router } from './routes/app_routes.jsx';

const app_router = create_app_router();

// Root component: light or dark mode, login state and the "Are you sure?" popup for the
// whole app, then the router.
function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ConfirmProvider>
          <RouterProvider router={app_router} />
        </ConfirmProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
