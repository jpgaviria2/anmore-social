/**
 * Trails Coffee — Site-Wide Nostr Identity Manager
 * Provides a unified identity across all site features (chat, marketplace, events, feed).
 * 
 * LAZY KEY GENERATION: No keys are created on page load.
 * Keys are only created when the user explicitly logs in or chooses "anonymous" at submission time.
 */
(function() {
  'use strict';

  const STORAGE_KEY_SESSION = 'trails_nostr_sk';
  const STORAGE_KEY_PERSIST = 'trails_nostr_sk_saved';
  const STORAGE_KEY_IMPORTED = 'trails_imported_key';
  const STORAGE_KEY_MODE = 'trails_nostr_mode'; // 'anonymous' | 'nip07' | 'nsec' | null
  const STORAGE_KEY_NO_NAG = 'trails_no_save_nag';

  let _privateKeyHex = null;
  let _publicKeyHex = null;
  let _mode = null; // null means no identity yet
  let _initialized = false;
  let _savePromptShown = false;

  // --- Helpers ---

  function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  function getNostrTools() {
    return window.NostrTools || null;
  }

  // --- Key Management ---

  function generateKeypair() {
    const nt = getNostrTools();
    if (!nt || !nt.generateSecretKey) {
      const sk = new Uint8Array(32);
      crypto.getRandomValues(sk);
      return bytesToHex(sk);
    }
    return bytesToHex(nt.generateSecretKey());
  }

  function pubkeyFromPrivate(skHex) {
    const nt = getNostrTools();
    if (!nt || !nt.getPublicKey) return null;
    var pk;
    try { pk = nt.getPublicKey(skHex); } catch(e) { pk = nt.getPublicKey(hexToBytes(skHex)); }
    return typeof pk === 'string' ? pk : bytesToHex(pk);
  }

  function nsecToHex(nsec) {
    const nt = getNostrTools();
    if (!nt || !nt.nip19) return null;
    try {
      const decoded = nt.nip19.decode(nsec);
      if (decoded.type === 'nsec') {
        return decoded.data instanceof Uint8Array ? bytesToHex(decoded.data) : decoded.data;
      }
    } catch (e) {
      console.error('[NostrIdentity] Failed to decode nsec:', e);
    }
    return null;
  }

  function hexToNsec(hex) {
    const nt = getNostrTools();
    if (!nt || !nt.nip19) return null;
    try {
      return nt.nip19.nsecEncode(hexToBytes(hex));
    } catch (e) { return null; }
  }

  function hexToNpub(hex) {
    const nt = getNostrTools();
    if (!nt || !nt.nip19) return null;
    try {
      return nt.nip19.npubEncode(hex);
    } catch (e) { return null; }
  }

  // --- Initialization (LAZY - only loads existing keys, never generates) ---

  function init() {
    if (_initialized) return;
    _initialized = true;

    // Priority: 1) imported nsec, 2) saved/persisted key, 3) session key — but NEVER generate
    const importedKey = localStorage.getItem(STORAGE_KEY_IMPORTED);
    const savedKey = localStorage.getItem(STORAGE_KEY_PERSIST);
    const sessionKey = sessionStorage.getItem(STORAGE_KEY_SESSION);
    const savedMode = sessionStorage.getItem(STORAGE_KEY_MODE);

    if (importedKey) {
      _privateKeyHex = importedKey.startsWith('nsec1') ? nsecToHex(importedKey) : importedKey;
      _mode = 'nsec';
    } else if (savedKey) {
      _privateKeyHex = savedKey.startsWith('nsec1') ? nsecToHex(savedKey) : savedKey;
      _mode = 'nsec';
    } else if (sessionKey) {
      _privateKeyHex = sessionKey;
      _mode = savedMode || 'anonymous';
    }
    // If no key found, _privateKeyHex stays null, _mode stays null
    // No ephemeral key generation!

    if (_privateKeyHex) {
      _publicKeyHex = pubkeyFromPrivate(_privateKeyHex);
    }

    console.log('[NostrIdentity] Initialized, mode:', _mode, 'pubkey:', _publicKeyHex ? _publicKeyHex.substring(0, 12) + '...' : 'none');
  }

  // --- Generate Ephemeral Key (on demand only) ---

  function generateEphemeral() {
    _privateKeyHex = generateKeypair();
    _publicKeyHex = pubkeyFromPrivate(_privateKeyHex);
    _mode = 'anonymous';
    sessionStorage.setItem(STORAGE_KEY_SESSION, _privateKeyHex);
    sessionStorage.setItem(STORAGE_KEY_MODE, 'anonymous');
    console.log('[NostrIdentity] Generated ephemeral key, pubkey:', _publicKeyHex.substring(0, 12) + '...');
    return _privateKeyHex;
  }

  // --- Login Methods ---

  function loginWithNip07() {
    if (!window.nostr) {
      console.warn('[NostrIdentity] No NIP-07 extension detected');
      return Promise.reject(new Error('No NIP-07 extension found'));
    }
    _mode = 'nip07';
    sessionStorage.setItem(STORAGE_KEY_MODE, 'nip07');
    return window.nostr.getPublicKey().then(function(pk) {
      _publicKeyHex = pk;
      _privateKeyHex = null;
      console.log('[NostrIdentity] NIP-07 login, pubkey:', pk.substring(0, 12) + '...');
      return pk;
    });
  }

  function loginWithNsec(nsecOrHex) {
    let hex = nsecOrHex;
    if (nsecOrHex.startsWith('nsec1')) {
      hex = nsecToHex(nsecOrHex);
      if (!hex) throw new Error('Invalid nsec');
    }
    if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('Invalid private key');
    
    _privateKeyHex = hex;
    _publicKeyHex = pubkeyFromPrivate(hex);
    _mode = 'nsec';
    
    // Persist imported key
    localStorage.setItem(STORAGE_KEY_PERSIST, hex);
    localStorage.setItem(STORAGE_KEY_IMPORTED, nsecOrHex.startsWith('nsec1') ? nsecOrHex : hex);
    sessionStorage.setItem(STORAGE_KEY_SESSION, hex);
    sessionStorage.setItem(STORAGE_KEY_MODE, 'nsec');
    
    console.log('[NostrIdentity] nsec login, pubkey:', _publicKeyHex?.substring(0, 12) + '...');
    return _publicKeyHex;
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY_PERSIST);
    localStorage.removeItem(STORAGE_KEY_IMPORTED);
    sessionStorage.removeItem(STORAGE_KEY_SESSION);
    sessionStorage.removeItem(STORAGE_KEY_MODE);
    sessionStorage.removeItem(STORAGE_KEY_NO_NAG);
    
    _privateKeyHex = null;
    _publicKeyHex = null;
    _mode = null;
    // No ephemeral key generation on logout!
  }

  // --- Signing ---

  function signEvent(event) {
    if (_mode === 'nip07' && window.nostr) {
      return window.nostr.signEvent(event);
    }
    
    if (!_privateKeyHex) {
      return Promise.reject(new Error('No private key available'));
    }
    
    const nt = getNostrTools();
    if (!nt || !nt.finalizeEvent) {
      return Promise.reject(new Error('nostr-tools not loaded'));
    }
    
    var sk;
    try { sk = _privateKeyHex; nt.finalizeEvent(Object.assign({}, event), sk); } catch(e) { sk = hexToBytes(_privateKeyHex); }
    const signed = nt.finalizeEvent(event, sk);
    return Promise.resolve(signed);
  }

  // --- NIP-04 Encryption/Decryption ---

  function nip04Encrypt(pubkey, plaintext) {
    if (_mode === 'nip07' && window.nostr && window.nostr.nip04) {
      return window.nostr.nip04.encrypt(pubkey, plaintext);
    }
    
    const nt = getNostrTools();
    if (!nt || !nt.nip04) {
      return Promise.reject(new Error('NIP-04 not available'));
    }
    return nt.nip04.encrypt(_privateKeyHex, pubkey, plaintext).catch(function() {
      return nt.nip04.encrypt(hexToBytes(_privateKeyHex), pubkey, plaintext);
    });
  }

  function nip04Decrypt(pubkey, ciphertext) {
    if (_mode === 'nip07' && window.nostr && window.nostr.nip04) {
      return window.nostr.nip04.decrypt(pubkey, ciphertext);
    }
    
    const nt = getNostrTools();
    if (!nt || !nt.nip04) {
      return Promise.reject(new Error('NIP-04 not available'));
    }
    return nt.nip04.decrypt(_privateKeyHex, pubkey, ciphertext).catch(function() {
      return nt.nip04.decrypt(hexToBytes(_privateKeyHex), pubkey, ciphertext);
    });
  }

  // --- Save Prompt ---

  function promptToSave() {
    if (_mode !== 'anonymous') return;
    if (_savePromptShown) return;
    if (sessionStorage.getItem(STORAGE_KEY_NO_NAG)) return;
    if (localStorage.getItem(STORAGE_KEY_PERSIST)) return;
    
    _savePromptShown = true;
    
    const overlay = document.createElement('div');
    overlay.id = 'nostr-save-prompt';
    overlay.innerHTML = `
      <div style="position:fixed;bottom:20px;right:20px;max-width:380px;background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.2);padding:24px;z-index:100000;font-family:'Quicksand',sans-serif;border-left:4px solid #6B4423;">
        <h3 style="margin:0 0 8px;color:#6B4423;font-size:16px;">Save your identity?</h3>
        <p style="margin:0 0 16px;color:#555;font-size:14px;line-height:1.4;">
          You've been using an anonymous identity. Save it to keep your posts and reputation across visits.
        </p>
        <div style="display:flex;gap:8px;">
          <button id="nostr-save-yes" style="flex:1;padding:10px;background:linear-gradient(135deg,#6B4423,#8B6914);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:14px;">Save My Key</button>
          <button id="nostr-save-no" style="flex:1;padding:10px;background:#f5f5f5;color:#666;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:14px;">No Thanks</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    document.getElementById('nostr-save-yes').addEventListener('click', function() {
      localStorage.setItem(STORAGE_KEY_PERSIST, _privateKeyHex);
      overlay.remove();
      showNsecReveal();
    });
    
    document.getElementById('nostr-save-no').addEventListener('click', function() {
      sessionStorage.setItem(STORAGE_KEY_NO_NAG, '1');
      overlay.remove();
    });
  }

  function showNsecReveal() {
    const nsec = hexToNsec(_privateKeyHex);
    const npub = hexToNpub(_publicKeyHex);
    
    const overlay = document.createElement('div');
    overlay.id = 'nostr-nsec-reveal';
    overlay.innerHTML = `
      <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:100001;display:flex;align-items:center;justify-content:center;padding:20px;">
        <div style="background:#fff;border-radius:16px;max-width:440px;width:100%;padding:28px;font-family:'Quicksand',sans-serif;">
          <h3 style="color:#6B4423;margin:0 0 12px;font-size:18px;">🔑 Your Nostr Identity</h3>
          <p style="color:#555;font-size:14px;line-height:1.5;margin:0 0 16px;">
            This is your private key. It's like a password — <strong>save it somewhere safe</strong> and never share it. You can use it to log in from any Nostr app.
          </p>
          <div style="margin-bottom:12px;">
            <label style="font-size:12px;color:#888;font-weight:600;">YOUR PUBLIC KEY (safe to share)</label>
            <div style="background:#f7f3ef;padding:10px;border-radius:8px;word-break:break-all;font-family:monospace;font-size:12px;color:#6B4423;margin-top:4px;">${npub || _publicKeyHex}</div>
          </div>
          <div style="margin-bottom:16px;">
            <label style="font-size:12px;color:#888;font-weight:600;">YOUR PRIVATE KEY (keep secret!)</label>
            <div style="background:#fff5f5;padding:10px;border-radius:8px;word-break:break-all;font-family:monospace;font-size:12px;color:#c0392b;border:1px solid #f0d0d0;margin-top:4px;">${nsec || _privateKeyHex}</div>
          </div>
          <button id="nostr-nsec-close" style="width:100%;padding:12px;background:linear-gradient(135deg,#6B4423,#8B6914);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:14px;">I've Saved It</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    document.getElementById('nostr-nsec-close').addEventListener('click', function() {
      overlay.remove();
    });
  }

  // --- Identity Prompt Modal (anonymous vs login) ---

  function showIdentityPrompt() {
    return new Promise(function(resolve, reject) {
      const existing = document.getElementById('nostr-identity-prompt');
      if (existing) existing.remove();

      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
      const hasNip07 = !isStandalone && !!window.nostr;

      const modal = document.createElement('div');
      modal.id = 'nostr-identity-prompt';
      modal.innerHTML = `
        <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:100001;display:flex;align-items:center;justify-content:center;padding:20px;">
          <div style="background:#fff;border-radius:16px;max-width:420px;width:100%;padding:28px;font-family:'Quicksand',sans-serif;">
            <h3 style="color:#6B4423;margin:0 0 8px;font-size:18px;">🌱 You need an identity</h3>
            <p style="color:#555;font-size:14px;line-height:1.5;margin:0 0 20px;">
              To submit content or upload media, you need a Nostr identity. You can log in with an existing key or go anonymous.
            </p>
            
            ${hasNip07 ? `
            <button id="identity-prompt-nip07" style="width:100%;padding:12px;background:linear-gradient(135deg,#6B4423,#8B6914);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:14px;margin-bottom:10px;">
              Use Browser Extension
            </button>
            ` : ''}
            
            <button id="identity-prompt-nsec" style="width:100%;padding:12px;background:#f7f3ef;color:#6B4423;border:1px solid #6B4423;border-radius:8px;cursor:pointer;font-weight:600;font-size:14px;margin-bottom:10px;">
              🔐 Login with nsec
            </button>
            
            <button id="identity-prompt-anon" style="width:100%;padding:12px;background:#e8f5e9;color:#2e7d32;border:1px solid #4caf50;border-radius:8px;cursor:pointer;font-weight:600;font-size:14px;margin-bottom:10px;">
              🎭 Go Anonymous
            </button>
            
            <div style="text-align:center;">
              <button id="identity-prompt-cancel" style="background:none;border:none;color:#888;cursor:pointer;font-size:13px;text-decoration:underline;">
                Cancel
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      function cleanup() { modal.remove(); }

      if (hasNip07) {
        document.getElementById('identity-prompt-nip07').addEventListener('click', function() {
          loginWithNip07().then(function() {
            cleanup();
            resolve('nip07');
          }).catch(function(e) {
            alert('Extension error: ' + e.message);
          });
        });
      }

      document.getElementById('identity-prompt-nsec').addEventListener('click', function() {
        cleanup();
        // Show nsec login modal, resolve when done
        _showNsecLoginForPrompt(resolve, reject);
      });

      document.getElementById('identity-prompt-anon').addEventListener('click', function() {
        generateEphemeral();
        cleanup();
        resolve('anonymous');
      });

      document.getElementById('identity-prompt-cancel').addEventListener('click', function() {
        cleanup();
        reject(new Error('User cancelled identity selection'));
      });
    });
  }

  function _showNsecLoginForPrompt(resolve, reject) {
    const modal = document.createElement('div');
    modal.id = 'nostr-identity-prompt';
    modal.innerHTML = `
      <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:100001;display:flex;align-items:center;justify-content:center;padding:20px;">
        <div style="background:#fff;border-radius:16px;max-width:420px;width:100%;padding:28px;font-family:'Quicksand',sans-serif;">
          <h3 style="color:#6B4423;margin:0 0 16px;font-size:18px;">🔐 Login with Nostr Key</h3>
          
          <div style="margin-bottom:12px;">
            <label style="font-size:13px;color:#555;font-weight:600;">Enter your nsec or hex private key:</label>
            <input id="identity-nsec-input" type="password" placeholder="nsec1... or hex" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-top:6px;font-family:monospace;font-size:13px;box-sizing:border-box;">
            <p id="identity-login-error" style="color:#c0392b;font-size:12px;margin:4px 0 0;display:none;"></p>
          </div>
          
          <button id="identity-nsec-login-btn" style="width:100%;padding:12px;background:linear-gradient(135deg,#6B4423,#8B6914);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:14px;margin-bottom:12px;">
            Login
          </button>
          
          <div style="text-align:center;">
            <button id="identity-nsec-cancel" style="background:none;border:none;color:#888;cursor:pointer;font-size:13px;text-decoration:underline;">
              Cancel
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('identity-nsec-login-btn').addEventListener('click', function() {
      const input = document.getElementById('identity-nsec-input').value.trim();
      if (!input) return;
      try {
        loginWithNsec(input);
        modal.remove();
        resolve('nsec');
      } catch (e) {
        const err = document.getElementById('identity-login-error');
        err.textContent = e.message;
        err.style.display = 'block';
      }
    });

    document.getElementById('identity-nsec-cancel').addEventListener('click', function() {
      modal.remove();
      reject(new Error('User cancelled login'));
    });
  }

  // --- Login UI Modal (standalone, for the "Login with nsec" button) ---

  function showLoginModal() {
    const existing = document.getElementById('nostr-login-modal');
    if (existing) existing.remove();

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const hasNip07 = !isStandalone && !!window.nostr;
    
    const modal = document.createElement('div');
    modal.id = 'nostr-login-modal';
    modal.innerHTML = `
      <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:100001;display:flex;align-items:center;justify-content:center;padding:20px;">
        <div style="background:#fff;border-radius:16px;max-width:420px;width:100%;padding:28px;font-family:'Quicksand',sans-serif;">
          <h3 style="color:#6B4423;margin:0 0 16px;font-size:18px;">🔐 Login to Trails Coffee</h3>
          
          ${hasNip07 ? `
          <button id="nostr-login-nip07" style="width:100%;padding:12px;background:linear-gradient(135deg,#6B4423,#8B6914);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:14px;margin-bottom:12px;">
            Use Browser Extension (Recommended)
          </button>
          ` : ''}
          
          <div style="margin-bottom:12px;">
            <label style="font-size:13px;color:#555;font-weight:600;">Enter your nsec or hex private key:</label>
            <input id="nostr-login-nsec" type="password" placeholder="nsec1... or hex" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-top:6px;font-family:monospace;font-size:13px;box-sizing:border-box;">
            <p id="nostr-login-error" style="color:#c0392b;font-size:12px;margin:4px 0 0;display:none;"></p>
          </div>
          
          <button id="nostr-login-nsec-btn" style="width:100%;padding:12px;background:#f7f3ef;color:#6B4423;border:1px solid #6B4423;border-radius:8px;cursor:pointer;font-weight:600;font-size:14px;margin-bottom:12px;">
            Login with Key
          </button>
          
          <div style="text-align:center;">
            <button id="nostr-login-cancel" style="background:none;border:none;color:#888;cursor:pointer;font-size:13px;text-decoration:underline;">
              Cancel
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    if (hasNip07) {
      document.getElementById('nostr-login-nip07').addEventListener('click', function() {
        loginWithNip07().then(function() { modal.remove(); updateIdentityUI(); }).catch(function(e) {
          var err = document.getElementById('nostr-login-error');
          err.textContent = 'Extension error: ' + e.message;
          err.style.display = 'block';
        });
      });
    }

    document.getElementById('nostr-login-nsec-btn').addEventListener('click', function() {
      var input = document.getElementById('nostr-login-nsec').value.trim();
      if (!input) return;
      try {
        loginWithNsec(input);
        modal.remove();
        updateIdentityUI();
      } catch (e) {
        var err = document.getElementById('nostr-login-error');
        err.textContent = e.message;
        err.style.display = 'block';
      }
    });

    document.getElementById('nostr-login-cancel').addEventListener('click', function() {
      modal.remove();
    });
  }

  // --- UI Update Helper ---
  function updateIdentityUI() {
    // Dispatch custom event so forms.js can react
    window.dispatchEvent(new CustomEvent('nostr-identity-changed', { detail: { mode: _mode, pubkey: _publicKeyHex } }));
  }

  // --- Public API ---

  window.NostrIdentity = {
    init: init,
    
    getPrivateKey: function() {
      if (!_initialized) init();
      return _privateKeyHex; // may be null if no identity yet
    },
    
    getPrivateKeyBytes: function() {
      if (!_initialized) init();
      return _privateKeyHex ? hexToBytes(_privateKeyHex) : null;
    },
    
    getPublicKey: function() {
      if (!_initialized) init();
      return _publicKeyHex; // may be null
    },
    
    getMode: function() {
      if (!_initialized) init();
      return _mode; // may be null
    },
    
    hasIdentity: function() {
      if (!_initialized) init();
      return _privateKeyHex !== null || (_mode === 'nip07' && _publicKeyHex !== null);
    },
    
    isAnonymous: function() {
      return _mode === 'anonymous';
    },
    
    isAuthenticated: function() {
      return _mode === 'nsec' || _mode === 'nip07';
    },
    
    isPersisted: function() {
      return !!localStorage.getItem(STORAGE_KEY_PERSIST) || !!localStorage.getItem(STORAGE_KEY_IMPORTED);
    },
    
    // Generate ephemeral key on demand (for anonymous flow)
    generateEphemeral: generateEphemeral,
    
    // Show identity prompt (returns promise resolving to 'anonymous'|'nsec'|'nip07')
    showIdentityPrompt: showIdentityPrompt,
    
    signEvent: signEvent,
    nip04Encrypt: nip04Encrypt,
    nip04Decrypt: nip04Decrypt,
    
    loginWithNip07: loginWithNip07,
    loginWithNsec: loginWithNsec,
    logout: logout,
    showLoginModal: showLoginModal,
    
    promptToSave: promptToSave,
    
    // Utility
    hexToNsec: hexToNsec,
    hexToNpub: hexToNpub,
    nsecToHex: nsecToHex
  };

  // Auto-init on DOM ready (only loads existing keys, never generates)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
