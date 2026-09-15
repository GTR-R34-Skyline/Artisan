import React, { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './components/Login';
import { AuthProvider } from './auth/useAuth';
import { useAuth } from './auth/useAuthHook';
import { RoleRoute } from './auth/RoleRoute';
import { CartProvider } from './context/CartContext';
import { LocaleProvider, useLocale } from './i18n/LocaleContext';

const HomePage = lazy(() => import('./pages/HomePage'));
const MarketplacePage = lazy(() => import('./pages/MarketplacePage'));
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage'));
const CraftsmanPage = lazy(() => import('./pages/CraftsmanPage'));
const CartPage = lazy(() => import('./pages/CartPage'));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'));
const MockUpiPaymentPage = lazy(() => import('./pages/MockUpiPaymentPage'));
const OrderConfirmationPage = lazy(() => import('./pages/OrderConfirmationPage'));
const VendorRegistration = lazy(() => import('./components/VendorRegistration'));
const VendorDashboard = lazy(() => import('./components/VendorDashboard'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const CourierDashboardPage = lazy(() => import('./pages/courier/CourierDashboardPage'));
const ShipmentDetailPage = lazy(() => import('./pages/courier/ShipmentDetailPage'));
const VendorOnboarding = lazy(() => import('./components/VendorOnboarding').then((module) => ({ default: module.VendorOnboarding })));
const SimplifiedListingWizard = lazy(() => import('./pages/vendor/SimplifiedListingWizard').then((module) => ({ default: module.SimplifiedListingWizard })));

const PageLoader: React.FC = () => {
  const { t } = useLocale();
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-[1400px] items-center px-6 lg:px-10">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">{t('loading.opening')}</p>
    </div>
  );
};

const AppContent: React.FC = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleAdminLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/marketplace" element={<MarketplacePage />} />
          <Route path="/marketplace/:productId" element={<ProductDetailPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/checkout/payment/:orderId" element={<MockUpiPaymentPage />} />
          <Route path="/checkout/confirmation/:orderId" element={<OrderConfirmationPage />} />
          <Route path="/craftsman/:id" element={<CraftsmanPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin/login" element={<Navigate to="/login" replace />} />
          <Route path="/join" element={<div className="mx-auto max-w-[1400px] px-6 py-12 lg:px-10"><VendorRegistration /></div>} />
          <Route path="/vendor/register" element={<Navigate to="/join" replace />} />
          <Route
            path="/vendor/onboarding"
            element={
              <RoleRoute allowedRoles={['vendor', 'admin']}>
                <VendorOnboarding />
              </RoleRoute>
            }
          />
          <Route
            path="/vendor/dashboard"
            element={
              <RoleRoute allowedRoles={['vendor', 'admin']}>
                <VendorDashboard />
              </RoleRoute>
            }
          />
          <Route
            path="/vendor/wizard"
            element={
              <RoleRoute allowedRoles={['vendor', 'admin']}>
                <SimplifiedListingWizard />
              </RoleRoute>
            }
          />
          <Route
            path="/marketplace/register"
            element={
              <RoleRoute allowedRoles={['vendor', 'consumer', 'admin']}>
                <SimplifiedListingWizard />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <RoleRoute allowedRoles={['admin']}>
                <AdminDashboard onLogout={handleAdminLogout} />
              </RoleRoute>
            }
          />
          <Route
            path="/courier/dashboard"
            element={
              <RoleRoute allowedRoles={['courier']}>
                <CourierDashboardPage />
              </RoleRoute>
            }
          />
          <Route
            path="/courier/shipments/:shipmentId"
            element={
              <RoleRoute allowedRoles={['courier']}>
                <ShipmentDetailPage />
              </RoleRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
};

const App: React.FC = () => (
  <AuthProvider>
    <LocaleProvider>
      <CartProvider>
        <AppContent />
      </CartProvider>
    </LocaleProvider>
  </AuthProvider>
);

export default App;
