export interface AuthState {
  isAuthenticated: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
}

export const checkAuthStatus = async (): Promise<AuthState> => {
  try {
    const response = await fetch('/api/auth/status', {
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        isAuthenticated: data.authenticated,
        user: data.user || null
      };
    }
    
    return { isAuthenticated: false, user: null };
  } catch (error) {
    console.error('Auth status check failed:', error);
    return { isAuthenticated: false, user: null };
  }
};

export const initiateOktaLogin = () => {
  window.location.href = '/api/auth/login';
};

export const logout = async () => {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
    window.location.href = '/';
  } catch (error) {
    console.error('Logout failed:', error);
  }
};
