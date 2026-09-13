import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ProfileRole } from './AuthContext';
import { useAuth } from './useAuthHook';

interface RoleRouteProps {
  allowedRoles: ProfileRole[];
  children: React.ReactNode;
}

export const RoleRoute: React.FC<RoleRouteProps> = ({ allowedRoles, children }) => {
  const location = useLocation();
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-[1400px] items-center px-6 lg:px-10">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Checking access</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!profile) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-[1400px] items-center px-6 lg:px-10">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Loading profile</span>
      </div>
    );
  }

  if (!allowedRoles.includes(profile.role)) {
    const roleHome =
      profile.role === 'admin'
        ? '/admin/dashboard'
        : profile.role === 'vendor'
          ? '/vendor/dashboard'
          : profile.role === 'courier'
            ? '/courier/dashboard'
            : '/marketplace';

    return <Navigate to={roleHome} replace />;
  }

  return <>{children}</>;
};
