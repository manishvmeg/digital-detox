/**
 * public/js/auth.js
 * Handles Google OAuth Identity flow client-side logic.
 * Integrates with GIS (Google Identity Services) and communicates token with Express server.
 */

class AuthManager {
  constructor(updateCallback) {
    this.user = null;
    this.onUserUpdate = updateCallback;
  }

  init() {
    // Check local storage for existing session
    const storedUser = localStorage.getItem('clarity_user');
    if (storedUser) {
      try {
        this.user = JSON.parse(storedUser);
        if (this.onUserUpdate) this.onUserUpdate(this.user);
      } catch (e) {
        console.error('Failed to parse cached user session:', e);
      }
    }

    // Initialize GIS Client when library loads
    window.addEventListener('load', () => {
      this.initGoogleOAuth();
    });
  }

  initGoogleOAuth() {
    if (typeof google === 'undefined') {
      console.warn('Google Identity Service script not loaded yet. Retrying in 1.5s...');
      setTimeout(() => this.initGoogleOAuth(), 1500);
      return;
    }

    // Google Identity Service setup
    google.accounts.id.initialize({
      client_id: 'your_google_oauth_client_id_here', // Fallback defaults handled on server side
      callback: (response) => this.handleCredentialResponse(response),
      auto_select: false,
      cancel_on_tap_outside: true
    });

    // Render the login button
    const btnContainer = document.getElementById('googleSignInBtn');
    if (btnContainer) {
      google.accounts.id.renderButton(btnContainer, {
        theme: 'dark',
        size: 'medium',
        type: 'standard',
        shape: 'pill',
        text: 'signin_with',
        logo_alignment: 'left'
      });
    }
  }

  async handleCredentialResponse(response) {
    try {
      console.log('[AuthManager]: Google credentials received, verifying with backend...');
      
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token: response.credential })
      });

      const data = await res.json();

      if (data.success) {
        this.user = data.user;
        localStorage.setItem('clarity_user', JSON.stringify(this.user));
        localStorage.setItem('clarity_auth_mode', data.mode);
        
        console.log('[AuthManager]: Authentication successful. User:', this.user.name);
        
        if (this.onUserUpdate) {
          this.onUserUpdate(this.user, data.mode);
        }
      } else {
        alert('Authentication failed: ' + data.message);
      }
    } catch (error) {
      console.error('[AuthManager Error]: Failed to authenticate with backend.', error);
      alert('Network error during authentication. Running in Local Mode.');
    }
  }

  logout() {
    this.user = null;
    localStorage.removeItem('clarity_user');
    localStorage.removeItem('clarity_auth_mode');
    
    // Revoke token if applicable
    if (typeof google !== 'undefined') {
      google.accounts.id.disableAutoSelect();
    }
    
    if (this.onUserUpdate) {
      this.onUserUpdate(null);
    }
  }
}

// Export class globally
window.AuthManager = AuthManager;
