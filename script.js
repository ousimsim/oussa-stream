// ==========================================
// 1. FIREBASE CONFIGURATION
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyAMxFcc8nt3RgsodtGBUw-jYEZu6Ui4NIA",
    authDomain: "oussastream.firebaseapp.com",
    databaseURL: "https://oussastream-default-rtdb.firebaseio.com",
    projectId: "oussastream",
    storageBucket: "oussastream.firebasestorage.app",
    messagingSenderId: "12799093969",
    appId: "1:12799093969:web:fc044c5c7b3c78a1e3e9f0"
};

// Initialize Firebase only if not already initialized
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// ==========================================
// 2. MAIN APPLICATION CLASS
// ==========================================
class OussaStreamApp {
    constructor() {
        // Firebase References
        this.db = firebase.database();
        this.auth = firebase.auth();

        // User State
        this.user = null;
        this.avatar = null;
        this.tempAvatarData = null;

        // Content Data
        this.movies = [];
        this.series = [];

        // User Specific Data (Favorites & Progress)
        this.myList = [];
        this.progress = {};

        // Performance Throttling
        this.lastSaveTime = 0;

        // Review System State
        this.activeReviews = [];
        this.editingReviewId = null;

        // Navigation State
        this.currentView = 'home';
        this.activeContent = null;

        // Player State
        this.player = null;
        this.playerUiTimeout = null;
        this.nextEpisodeTimer = null;

        // Pagination & Filters
        this.itemsPerPage = 12; // Increased for better desktop view
        this.currentPage = 1;
        this.currentCatalogType = 'all';
        this.activeFilters = {
            genre: 'all',
            year: 'all',
            sort: 'newest'
        };

        // Auth Modal State
        this.isLoginMode = true;
        this.isResetMode = false;

        // Bind History Event
        window.onpopstate = (event) => this.handlePopState(event);

        // Start App
        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        console.log("Initializing OussaStream...");

        this.initAuth();
        this.initPlayer();
        this.fetchData();

        this.handleNavbarScroll();
        this.setupSearch();
        this.setupFilters();
        this.setupFullscreenListener();

        // Handle URL parameters for direct linking (Persistence)
        this.handleInitialRouting();

        // Hide loading screen after a short delay
        setTimeout(() => {
            const loader = document.getElementById('loadingOverlay');
            if (loader) {
                loader.classList.add('hidden');
            }
        }, 1500);
    }

    // ==========================================
    // 3. ROUTING & STATE PERSISTENCE
    // ==========================================

    /**
     * Save current app state to localStorage to survive page refreshes
     */
    saveAppState() {
        const state = {
            view: this.currentView,
            id: this.activeContent ? this.activeContent.id : null
        };
        localStorage.setItem('oussaStreamLastState', JSON.stringify(state));
    }

    /**
     * Handle routing based on URL params or saved state
     */
    handleInitialRouting() {
        const params = new URLSearchParams(window.location.search);
        let view = params.get('view');
        let id = params.get('id');

        // If no URL params, check local storage (Resume user session)
        if (!view) {
            const savedState = JSON.parse(localStorage.getItem('oussaStreamLastState'));
            if (savedState) {
                view = savedState.view;
                id = savedState.id;
            }
        }

        // Route to specific view
        if (view) {
            if (view === 'details' && id) {
                // Wait for data fetch
                setTimeout(() => this.openDetails(id, true), 1000);
            } else if (view === 'player' && id) {
                // Safety: Go to details first, user can click play again
                setTimeout(() => this.openDetails(id, true), 1000);
            } else if (view === 'movies') {
                this.showMovies(true);
            } else if (view === 'series') {
                this.showSeries(true);
            } else if (view === 'mylist') {
                this.showMyList(true);
            }
        }
    }

    /**
     * Handle Browser Back/Forward buttons
     */
    handlePopState(event) {
        if (event.state) {
            const view = event.state.view;
            if (view === 'details' && event.state.id) {
                this.openDetails(event.state.id, true);
            } else if (view === 'movies') {
                this.showMovies(true);
            } else if (view === 'series') {
                this.showSeries(true);
            } else if (view === 'mylist') {
                this.showMyList(true);
            } else {
                this.showHome(true);
            }
        } else {
            this.showHome(true);
        }
    }

    /**
     * Update URL without reloading page
     */
    updateURL(view, id = null) {
        let url = `?view=${view}`;
        if (id) url += `&id=${id}`;

        const state = { view, id };
        history.pushState(state, '', url);
        this.saveAppState();
    }

    // ==========================================
    // 4. AUTHENTICATION & DATA ISOLATION logic
    // ==========================================

    /**
     * Initialize Auth Listener (Firebase)
     * Handles switching between Guest Mode (localStorage) and User Mode (Firebase)
     */
    initAuth() {
        this.auth.onAuthStateChanged((user) => {
            if (user) {
                // --- LOGGED IN MODE ---
                console.log("User Logged In:", user.uid);
                this.user = user;

                // Clear any guest data from memory to avoid mixing
                this.myList = [];
                this.progress = {};

                this.updateAuthUI(true);
                this.loadUserData(user.uid); // Load specific user data
                this.updateReviewUI(true);

                const name = user.displayName || (user.email ? user.email.split('@')[0] : 'User');

                // Only show toast if app is fully loaded
                if (document.getElementById('loadingOverlay') && document.getElementById('loadingOverlay').classList.contains('hidden')) {
                    this.showToast(`Welcome back, ${name}!`);
                }
            } else {
                // --- GUEST MODE ---
                console.log("Guest Mode Active");
                this.user = null;
                this.avatar = null;
                this.updateAuthUI(false);
                this.updateReviewUI(false);

                // Load Guest Data from LocalStorage
                this.myList = JSON.parse(localStorage.getItem('guest_myList')) || [];
                this.progress = JSON.parse(localStorage.getItem('guest_progress')) || {};

                // Render UI with guest data
                this.updateUI();
                this.renderContinueWatching();
                this.cancelEdit();
            }
        });
    }

    /**
     * Load User Data from Firebase Realtime Database
     */
    loadUserData(uid) {
        // 1. Load Avatar
        this.db.ref('users/' + uid + '/avatar').on('value', (snap) => {
            this.avatar = snap.val() || null;
            this.updateAuthUI(true);
        });

        // 2. Load My List (Favorites)
        this.db.ref('users/' + uid + '/myList').on('value', snap => {
            this.myList = snap.val() || [];
            if (this.currentView === 'mylist') {
                this.renderMyList();
            }
            // Update heart icons on any active view
            this.updateUI();
        });

        // 3. Load Watch Progress (Continue Watching)
        this.db.ref('users/' + uid + '/progress').on('value', snap => {
            this.progress = snap.val() || {};
            this.renderContinueWatching();
        });
    }

    // ==========================================
    // 5. USER INTERFACE UPDATES (Auth)
    // ==========================================

    updateAuthUI(isLoggedIn) {
        const container = document.getElementById('authSection');
        if (!container) return;

        if (isLoggedIn && this.user) {
            let avatarHtml = '';
            if (this.avatar) {
                avatarHtml = `<img src="${this.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;">`;
            } else {
                const name = this.user.displayName || (this.user.email ? this.user.email.split('@')[0] : 'U');
                avatarHtml = name.charAt(0).toUpperCase();
            }

            container.innerHTML = `
                <div class="d-flex align-items-center gap-3">
                    <div class="dropdown">
                        <div class="d-flex align-items-center" id="authAvatarBtn" data-bs-toggle="dropdown" aria-expanded="false" style="cursor: pointer;">
                            <div class="auth-avatar">
                                ${avatarHtml}
                            </div>
                        </div>
                        <ul class="dropdown-menu dropdown-menu-end dropdown-menu-dark" aria-labelledby="authAvatarBtn">
                            <li><a class="dropdown-item" href="#" onclick="app.openProfileModal()">My Profile</a></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item" href="#" onclick="app.logout()">Sign Out</a></li>
                        </ul>
                    </div>
                </div>
            `;
        } else {
            container.innerHTML = `<button class="btn btn-danger btn-sm fw-bold px-3" onclick="app.openAuthModal()">Sign In</button>`;
        }
    }

    // ==========================================
    // 6. AUTH MODAL HANDLERS
    // ==========================================

    openAuthModal() {
        this.isResetMode = false;
        this.updateAuthModalUI();
        document.getElementById('authModal').classList.add('show');
    }

    closeAuthModal() {
        document.getElementById('authModal').classList.remove('show');
    }

    toggleAuthMode() {
        this.isLoginMode = !this.isLoginMode;
        this.updateAuthModalUI();
    }

    toggleResetMode() {
        this.isResetMode = !this.isResetMode;
        if (!this.isResetMode) {
            this.isLoginMode = true;
        }
        this.updateAuthModalUI();
    }

    updateAuthModalUI() {
        const title = document.getElementById('authTitle');
        const btn = document.getElementById('authSubmitBtn');
        const passGroup = document.getElementById('passwordGroup');
        const switchContainer = document.getElementById('authSwitchContainer');
        const forgotLink = document.getElementById('forgotPasswordLink');
        const switchLink = document.querySelector('#authSwitchContainer a');
        const switchText = document.getElementById('authSwitchText');

        if (this.isResetMode) {
            title.textContent = 'Reset Password';
            btn.textContent = 'Send Reset Email';
            passGroup.style.display = 'none';
            switchContainer.style.display = 'none';
            document.getElementById('authPassword').style.display = 'none';
            forgotLink.textContent = 'Back to Sign In';
        } else {
            document.getElementById('authPassword').style.display = 'block';
            passGroup.style.display = 'block';
            switchContainer.style.display = 'block';
            forgotLink.textContent = 'Forgot Password?';

            if (this.isLoginMode) {
                title.textContent = 'Sign In';
                btn.textContent = 'Sign In';
                switchText.textContent = 'New to OussaStream? ';
                switchLink.textContent = 'Sign up now.';
                forgotLink.style.display = 'inline-block';
            } else {
                title.textContent = 'Sign Up';
                btn.textContent = 'Sign Up';
                switchText.textContent = 'Already have an account? ';
                switchLink.textContent = 'Sign in now.';
                forgotLink.style.display = 'none';
            }
        }
    }

    async handleAuth(e) {
        e.preventDefault();
        const email = document.getElementById('authEmail').value;
        const pass = document.getElementById('authPassword').value;
        const btn = document.getElementById('authSubmitBtn');

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Loading...';

        try {
            if (this.isResetMode) {
                await this.auth.sendPasswordResetEmail(email);
                this.showToast("Password reset email sent! Check your inbox.");
                this.toggleResetMode();
                return;
            }

            if (this.isLoginMode) {
                await this.auth.signInWithEmailAndPassword(email, pass);
            } else {
                await this.auth.createUserWithEmailAndPassword(email, pass);
            }
            this.closeAuthModal();
        } catch (error) {
            this.showToast(error.message);
        } finally {
            btn.disabled = false;
            this.updateAuthModalUI();
        }
    }

    logout() {
        this.auth.signOut();
        this.showToast("Signed out successfully.");
        this.closeProfileModal();
        localStorage.removeItem('oussaStreamLastState');
    }

    // ==========================================
    // 7. PROFILE & AVATAR HANDLING
    // ==========================================

    openProfileModal() {
        if (!this.user) return;
        const name = this.user.displayName || (this.user.email ? this.user.email.split('@')[0] : 'User');

        const img = document.getElementById('profileAvatarImg');
        const letter = document.getElementById('profileAvatarLetter');

        if (this.avatar) {
            img.src = this.avatar;
            img.style.display = 'block';
            letter.style.display = 'none';
        } else {
            img.style.display = 'none';
            letter.textContent = name.charAt(0).toUpperCase();
            letter.style.display = 'block';
        }

        this.tempAvatarData = null;
        document.getElementById('profileEmailDisplay').textContent = this.user.email;
        document.getElementById('profileName').value = this.user.displayName || '';
        document.getElementById('profilePassword').value = '';
        document.getElementById('profileModal').classList.add('show');
    }

    closeProfileModal() {
        document.getElementById('profileModal').classList.remove('show');
    }

    handleAvatarSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            this.showToast("Image too large. Max 2MB.");
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            // Resize image client-side to save DB space
            this.resizeImage(e.target.result, 150, 150, (resizedDataUrl) => {
                this.tempAvatarData = resizedDataUrl;
                const img = document.getElementById('profileAvatarImg');
                const letter = document.getElementById('profileAvatarLetter');
                img.src = resizedDataUrl;
                img.style.display = 'block';
                letter.style.display = 'none';
            });
        };
        reader.readAsDataURL(file);
    }

    resizeImage(base64, maxWidth, maxHeight, callback) {
        const img = new Image();
        img.src = base64;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Calculate Aspect Ratio
            if (width > height) {
                if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
            } else {
                if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.7)); // 70% Quality
        };
    }

    async handleProfileUpdate(e) {
        e.preventDefault();
        const name = document.getElementById('profileName').value;
        const password = document.getElementById('profilePassword').value;

        try {
            const updates = [];

            // Update Display Name
            if (name && name !== this.user.displayName) {
                updates.push(this.user.updateProfile({ displayName: name }));
            }

            // Update Password
            if (password) {
                updates.push(this.user.updatePassword(password));
            }

            if (updates.length > 0) {
                await Promise.all(updates);
                this.showToast("Profile Updated!");
            }

            // Update Avatar in Realtime Database
            if (this.tempAvatarData) {
                await this.db.ref('users/' + this.user.uid + '/avatar').set(this.tempAvatarData);
                this.showToast("Avatar Updated!");
                // Also update past reviews with new avatar
                this.updateUserReviews(this.user.uid, name || this.user.displayName, this.tempAvatarData);
            } else if (name && name !== this.user.displayName) {
                // Update reviews with new name only
                this.updateUserReviews(this.user.uid, name, this.avatar);
            }

            this.closeProfileModal();
            this.updateAuthUI(true);

        } catch (error) {
            if (error.code === 'auth/requires-recent-login') {
                this.showToast("Security: Please sign in again to change password.");
                this.logout();
            } else {
                this.showToast(error.message);
            }
        }
    }

    updateUserReviews(userId, newName, newAvatar) {
        this.db.ref('reviews').once('value', (snapshot) => {
            const allReviews = snapshot.val();
            if (!allReviews) return;
            const updates = {};

            // Scan all reviews for current user
            Object.keys(allReviews).forEach(movieId => {
                const movieReviews = allReviews[movieId];
                Object.keys(movieReviews).forEach(reviewId => {
                    const review = movieReviews[reviewId];
                    if (review.userId === userId) {
                        if (newName) updates[`reviews/${movieId}/${reviewId}/userName`] = newName;
                        if (newAvatar) updates[`reviews/${movieId}/${reviewId}/userAvatar`] = newAvatar;
                    }
                });
            });

            if (Object.keys(updates).length > 0) {
                this.db.ref().update(updates)
                    .then(() => console.log("User reviews updated successfully"))
                    .catch(err => console.error("Failed to sync reviews", err));
            }
        });
    }

    // ==========================================
    // 8. DATA HANDLING (Favorites & Progress)
    // ==========================================

    toggleMyList(id) {
        const index = this.myList.indexOf(id);
        if (index > -1) {
            this.myList.splice(index, 1);
            this.showToast("Removed from My List");
        } else {
            this.myList.push(id);
            this.showToast("Added to My List!");
        }

        // Save based on Auth State (Isolation logic)
        if (this.user) {
            this.db.ref('users/' + this.user.uid + '/myList').set(this.myList)
                .catch(e => console.log("List save failed (permission)"));
        } else {
            localStorage.setItem('guest_myList', JSON.stringify(this.myList));
        }

        if (this.currentView === 'mylist') {
            this.renderMyList();
        }
        this.updateUI();
    }

    /**
     * Updates viewing progress for "Continue Watching"
     */
    updateProgress(id, time, duration) {
        if (!duration || duration === 0) return;

        const percent = (time / duration) * 100;
        let meta = {};

        // Capture Season/Episode for Series
        if (this.activeContent && this.activeContent.type === 'series') {
            const sSelect = document.getElementById('seasonSelect');
            const eSelect = document.getElementById('episodeSelect');
            if (sSelect && eSelect) {
                meta = {
                    season: sSelect.value,
                    episodeUrl: eSelect.value
                };
            }
        }

        // Logic: If user watched > 95%, consider it finished and remove from continue watching
        if (percent > 95) {
            if (this.progress[id]) delete this.progress[id];
        } else {
            // Save progress with timestamp for sorting
            this.progress[id] = { time, percent, lastUpdated: Date.now(), ...meta };
        }

        // Save Data (Isolated)
        if (this.user) {
            this.db.ref('users/' + this.user.uid + '/progress').set(this.progress)
                .catch(e => console.log("Progress save failed"));
        } else {
            localStorage.setItem('guest_progress', JSON.stringify(this.progress));
            // Manually update UI for guests since no DB listener exists
            this.renderContinueWatching();
        }
    }

    // ==========================================
    // 9. PLAYER INITIALIZATION & LOGIC
    // ==========================================

    initPlayer() {
        // Initialize Plyr instance
        this.player = new Plyr('#player', {
            controls: [
                'play-large', 'play', 'progress', 'current-time',
                'mute', 'volume', 'captions', 'settings', 'pip',
                'airplay', 'fullscreen'
            ]
        });

        // --- EVENT: Loaded Metadata (RESUME PLAYBACK) ---
        this.player.on('loadedmetadata', () => {
            if (this.activeContent && this.progress[this.activeContent.id]) {
                const savedTime = this.progress[this.activeContent.id].time;
                if (savedTime > 0) {
                    this.player.currentTime = savedTime;
                    this.showToast(`Resumed at ${Math.floor(savedTime / 60)}m`);
                }
            }
        });

        // --- EVENT: Time Update (PROGRESS & NEXT EP) ---
        this.player.on('timeupdate', () => {
            if (this.activeContent && this.player.duration > 0) {
                const currentTime = this.player.currentTime;
                const duration = this.player.duration;

                // THROTTLING: Update Progress only every 5 seconds to prevent DB spam
                if (currentTime - this.lastSaveTime > 5) {
                    this.updateProgress(this.activeContent.id, currentTime, duration);
                    this.lastSaveTime = currentTime;
                }

                // NEXT EPISODE LOGIC
                if (this.activeContent.type === 'series') {
                    const remaining = duration - currentTime;
                    // Show button if less than 40s remaining
                    if (remaining <= 40 && remaining > 0) {
                        this.showNextEpisodeOverlay();
                    } else {
                        this.hideNextEpisodeOverlay();
                    }
                }
            }
        });

        // --- EVENT: Ended (AUTO PLAY) ---
        this.player.on('ended', () => {
            if (this.activeContent && this.activeContent.type === 'series') {
                this.playNextEpisode();
            }
        });
    }

    // --- NEXT EPISODE UI HELPERS ---

    showNextEpisodeOverlay() {
        const overlay = document.getElementById('nextEpOverlay');
        const nextBtn = document.getElementById('nextEpBtn');
        const nextData = this.findNextEpisode();

        // Only show if a next episode actually exists
        if (nextData && overlay && !overlay.classList.contains('show')) {
            overlay.classList.add('show');
            nextBtn.onclick = () => this.playNextEpisode();
        }
    }

    hideNextEpisodeOverlay() {
        const overlay = document.getElementById('nextEpOverlay');
        if (overlay) overlay.classList.remove('show');
    }

    /**
     * Logic to calculate the next episode object
     */
    findNextEpisode() {
        const sNum = parseInt(document.getElementById('seasonSelect').value);
        const currentUrl = document.getElementById('episodeSelect').value;
        const seasons = this.activeContent.seasons;

        if (!seasons) return null;

        const currentSeason = seasons.find(s => (s.seasonNumber || 1) === sNum);
        if (!currentSeason) return null;

        const currentEpIndex = currentSeason.episodes.findIndex(e => e.videoUrl === currentUrl);

        // Case 1: Next episode in same season
        if (currentEpIndex !== -1 && currentEpIndex < currentSeason.episodes.length - 1) {
            return {
                season: sNum,
                episode: currentSeason.episodes[currentEpIndex + 1]
            };
        }
        // Case 2: First episode of next season
        else {
            const nextSeason = seasons.find(s => (s.seasonNumber || 1) === sNum + 1);
            if (nextSeason && nextSeason.episodes.length > 0) {
                return {
                    season: sNum + 1,
                    episode: nextSeason.episodes[0]
                };
            }
        }
        return null;
    }

    playNextEpisode() {
        const nextData = this.findNextEpisode();
        if (nextData) {
            // Update Selects in UI
            document.getElementById('seasonSelect').value = nextData.season;
            this.onSeasonChange(); // Refresh episode list based on new season
            document.getElementById('episodeSelect').value = nextData.episode.videoUrl;

            // Play
            this.playEpisode();
            this.showToast(`Playing Season ${nextData.season} Episode ${nextData.episode.episodeNumber}`);
            this.hideNextEpisodeOverlay();
        }
    }

    // ==========================================
    // 10. CONTENT DATA FETCHING
    // ==========================================

    fetchData() {
        // Fetch Movies
        this.db.ref('movies').on('value', snap => {
            const data = snap.val();
            this.movies = data ? Object.keys(data).map(k => ({ id: k, type: 'movie', ...data[k] })) : [];
            this.populateYearFilter();

            if (this.currentView === 'movies') this.renderCatalog('movie');

            // Important: Update Continue Watching when data arrives
            this.renderContinueWatching();
            this.updateUI();
        });

        // Fetch Series
        this.db.ref('series').on('value', snap => {
            const data = snap.val();
            this.series = data ? Object.keys(data).map(k => ({ id: k, type: 'series', ...data[k] })) : [];
            this.populateYearFilter();

            if (this.currentView === 'series') this.renderCatalog('series');

            this.renderContinueWatching();
            this.updateUI();
        });
    }

    // ==========================================
    // 11. FILTERS, SEARCH & PAGINATION
    // ==========================================

    populateYearFilter() {
        const yearSelect = document.getElementById('yearSelect');
        const allItems = [...this.movies, ...this.series];
        // Extract unique years and sort descending
        const years = [...new Set(allItems.map(item => item.year).filter(y => y))].sort((a, b) => b - a);
        yearSelect.innerHTML = '<option value="all">All Years</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
    }

    setupFilters() {
        const genreSelect = document.getElementById('genreSelect');
        const yearSelect = document.getElementById('yearSelect');
        const sortSelect = document.getElementById('sortSelect');

        const applyFilters = () => {
            this.activeFilters.genre = genreSelect.value;
            this.activeFilters.year = yearSelect.value;
            this.activeFilters.sort = sortSelect.value;
            this.currentPage = 1;
            this.renderCatalog(this.currentCatalogType);
        };

        genreSelect.addEventListener('change', applyFilters);
        yearSelect.addEventListener('change', applyFilters);
        sortSelect.addEventListener('change', applyFilters);
    }

    setupSearch() {
        const input = document.getElementById('searchInput');
        if (input) {
            input.addEventListener('input', () => {
                if (this.currentView !== 'movies' && this.currentView !== 'series') {
                    this.showMovies();
                }
                if (this.currentCatalogType === 'movie') this.renderCatalog('movie');
                else if (this.currentCatalogType === 'series') this.renderCatalog('series');
            });
        }
    }

    // ==========================================
    // 12. VIEW NAVIGATION HELPERS
    // ==========================================

    showHome(fromHistory = false) {
        this.currentView = 'home';
        this.switchView('mainContent');
        this.renderContinueWatching();
        if (!fromHistory) this.updateURL('home');
    }

    showMovies(fromHistory = false) {
        this.currentView = 'movies';
        this.currentPage = 1;
        this.currentCatalogType = 'movie';
        this.resetFiltersUI();
        document.getElementById('pageTitle').textContent = 'Movies';
        this.renderCatalog('movie');
        this.switchView('catalogPage');
        if (!fromHistory) this.updateURL('movies');
    }

    showSeries(fromHistory = false) {
        this.currentView = 'series';
        this.currentPage = 1;
        this.currentCatalogType = 'series';
        this.resetFiltersUI();
        document.getElementById('pageTitle').textContent = 'TV Series';
        this.renderCatalog('series');
        this.switchView('catalogPage');
        if (!fromHistory) this.updateURL('series');
    }

    showMyList(fromHistory = false) {
        this.currentView = 'mylist';
        this.renderMyList();
        this.switchView('myListPage');
        if (!fromHistory) this.updateURL('mylist');
    }

    resetFiltersUI() {
        this.activeFilters = { genre: 'all', year: 'all', sort: 'newest' };
        document.getElementById('genreSelect').value = 'all';
        document.getElementById('yearSelect').value = 'all';
        document.getElementById('sortSelect').value = 'newest';
        document.getElementById('searchInput').value = '';
    }

    switchView(id) {
        document.body.style.overflow = 'auto';

        // Stop player if moving away from player page
        if (this.player && id !== 'playerPage') {
            try { this.player.stop(); } catch (e) { }
        }

        // Clean iframes
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            if (iframe.id === 'embedPlayer' || iframe.closest('.player-page')) {
                iframe.src = '';
            }
        });

        this.stopPlayerUiTimer();
        const playerPage = document.getElementById('playerPage');
        if (playerPage) {
            playerPage.classList.remove('player-ui-hidden');
            if (id !== 'playerPage') {
                playerPage.onmousemove = null;
                playerPage.ontouchstart = null;
                playerPage.onclick = null;
            }
        }

        this.hideNextEpisodeOverlay();

        // Toggle Visibility
        ['mainContent', 'catalogPage', 'myListPage', 'detailsPage', 'playerPage'].forEach(p => {
            const el = document.getElementById(p);
            if (el) el.classList.toggle('hidden', p !== id);
        });

        window.scrollTo(0, 0);
        this.saveAppState();
    }

    goBack() {
        if (this.currentView === 'player') {
            this.closePlayer();
        } else {
            if (window.history.length > 1) {
                history.back();
            } else {
                this.showHome();
            }
        }
    }

    // ==========================================
    // 13. UI RENDERING (Catalog, Carousel, Etc)
    // ==========================================

    renderCatalog(typeFilter) {
        const container = document.getElementById('catalogGrid');
        if (!container) return;

        let data = typeFilter === 'movie' ? this.movies : this.series;

        // Apply Search
        const query = document.getElementById('searchInput').value.toLowerCase();
        if (query) {
            data = data.filter(i => i.title.toLowerCase().includes(query));
        }

        // Apply Genre
        if (this.activeFilters.genre !== 'all') {
            data = data.filter(item => {
                const itemGenre = (item.genre || item.type || "").toLowerCase();
                return itemGenre.includes(this.activeFilters.genre.toLowerCase());
            });
        }

        // Apply Year
        if (this.activeFilters.year !== 'all') {
            data = data.filter(item => item.year == this.activeFilters.year);
        }

        // Apply Sort
        data.sort((a, b) => {
            if (this.activeFilters.sort === 'newest') return (b.year || 0) - (a.year || 0);
            if (this.activeFilters.sort === 'oldest') return (a.year || 0) - (b.year || 0);
            if (this.activeFilters.sort === 'rating') return (b.rating || 0) - (a.rating || 0);
            return 0;
        });

        if (data.length === 0) {
            container.innerHTML = '<div class="col-12 text-center mt-5 text-muted"><h3>No results found.</h3></div>';
            document.getElementById('paginationControls').innerHTML = '';
            return;
        }

        // Pagination Logic
        const totalItems = data.length;
        const totalPages = Math.ceil(totalItems / this.itemsPerPage);
        if (this.currentPage > totalPages) this.currentPage = 1;

        const start = (this.currentPage - 1) * this.itemsPerPage;
        const end = start + this.itemsPerPage;
        const paginatedItems = data.slice(start, end);

        container.innerHTML = paginatedItems.map(i => this.createCard(i)).join('');
        this.renderPaginationControls(totalPages);
    }

    renderPaginationControls(totalPages) {
        const controls = document.getElementById('paginationControls');
        if (totalPages <= 1) { controls.innerHTML = ''; return; }

        controls.innerHTML = `
            <button class="page-btn" onclick="app.changePage(-1)" ${this.currentPage === 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i> Prev
            </button>
            <span class="page-info">Page ${this.currentPage} of ${totalPages}</span>
            <button class="page-btn" onclick="app.changePage(1)" ${this.currentPage === totalPages ? 'disabled' : ''}>
                Next <i class="fas fa-chevron-right"></i>
            </button>
        `;
    }

    changePage(direction) {
        this.currentPage += direction;
        this.renderCatalog(this.currentCatalogType);
        window.scrollTo(0, 0);
    }

    filterByGenre(genre) {
        this.currentView = 'movies';
        this.currentPage = 1;
        this.currentCatalogType = 'movie';
        this.resetFiltersUI();
        this.activeFilters.genre = genre;
        document.getElementById('genreSelect').value = genre;
        document.getElementById('pageTitle').textContent = `${genre}`;
        this.switchView('catalogPage');
        this.renderCatalog('movie');
    }

    createCard(item, isContinue = false) {
        const inList = this.myList.includes(item.id);
        const heartClass = inList ? 'fas fa-heart active-heart' : 'far fa-heart';
        const prog = this.progress[item.id];

        // Contextual Action Button
        const action = isContinue ? `app.playActiveMovieFromCard('${item.id}')` : `app.openDetails('${item.id}')`;
        const btnText = isContinue ? 'Resume' : 'Info';
        const playIcon = isContinue ? 'fa-play' : 'fa-info-circle';

        return `
        <div class="content-card" onclick="${action}">
            ${item.type === 'series' ? '<span class="badge-series">Series</span>' : ''}
            <img src="${item.poster}" alt="${item.title}" class="card-img" loading="lazy">
            ${isContinue && prog ? `<div class="progress-container"><div class="progress-bar" style="width: ${prog.percent}%"></div></div>` : ''}
            <div class="card-overlay">
                <h5 class="card-title">${item.title}</h5>
                <div class="card-buttons">
                    <button class="play-btn"><i class="fas ${playIcon}"></i> ${btnText}</button>
                    <button class="list-btn" onclick="event.stopPropagation(); app.toggleMyList('${item.id}')">
                        <i class="${heartClass}"></i>
                    </button>
                </div>
            </div>
        </div>`;
    }

    playActiveMovieFromCard(id) {
        const all = [...this.movies, ...this.series];
        const item = all.find(x => x.id === id);
        if (item) {
            this.activeContent = item;
            this.playActiveMovie();
        }
    }

    // ==========================================
    // 14. DETAILS PAGE LOGIC
    // ==========================================

    openDetails(id, fromHistory = false) {
        const all = [...this.movies, ...this.series];
        const item = all.find(x => x.id === id);
        if (!item) return;

        this.activeContent = item;
        this.currentView = 'details';

        if (!fromHistory) this.updateURL('details', id);

        // Populate Details UI
        const hero = document.getElementById('detailHero');
        const bgImage = item.backdrop || item.poster;
        hero.style.backgroundImage = `url('${bgImage}')`;

        document.getElementById('detailPoster').src = item.poster;
        document.getElementById('detailTitle').textContent = item.title;
        document.getElementById('detailDesc').textContent = item.description || "No description available.";
        document.getElementById('detailYear').textContent = item.year || "N/A";
        document.getElementById('detailRating').innerHTML = `<i class="fas fa-star"></i> ${item.rating || "N/A"}`;
        document.getElementById('detailGenre').textContent = item.genre || item.type.toUpperCase();

        // Button State (Resume vs Play)
        const playBtn = document.getElementById('detailPlayBtn');
        const listBtn = document.getElementById('detailListBtn');

        playBtn.innerHTML = '<i class="fas fa-play"></i> Watch Now';
        if (this.progress[item.id]) {
            playBtn.innerHTML = '<i class="fas fa-play"></i> Resume';
        }

        playBtn.onclick = () => this.playActiveMovie();
        this.updateDetailListBtn(item.id);

        listBtn.onclick = () => {
            this.toggleMyList(item.id);
            this.updateDetailListBtn(item.id);
        };

        this.cancelEdit();
        this.fetchReviews(id);
        this.updateReviewUI(!!this.user);

        this.renderRelated(item.type, item.id, 'detailRelatedGrid');

        this.switchView('detailsPage');
    }

    updateDetailListBtn(id) {
        const btn = document.getElementById('detailListBtn');
        if (this.myList.includes(id)) {
            btn.innerHTML = '<i class="fas fa-check"></i> Added';
            btn.classList.add('btn-light');
            btn.classList.remove('btn-outline-light');
        } else {
            btn.innerHTML = '<i class="far fa-heart"></i> My List';
            btn.classList.add('btn-outline-light');
            btn.classList.remove('btn-light');
        }
    }

    // ==========================================
    // 15. PLAYBACK CONTROL (Movie & Series)
    // ==========================================

    playActiveMovie() {
        if (!this.activeContent) return;
        const item = this.activeContent;
        const controls = document.getElementById('seriesControls');
        const playerTitle = document.getElementById('playerTitle');

        this.switchView('playerPage');
        this.currentView = 'player';
        this.updateURL('player', item.id);

        this.setupPlayerUI();

        // Auto Landscape on Mobile
        if (window.innerWidth < 768) {
            this.enterFullscreenAndRotate();
        }

        if (playerTitle) playerTitle.textContent = `Now Watching: ${item.title}`;

        const prog = this.progress[item.id];

        // --- SERIES HANDLING ---
        if (item.type === 'series' || (item.seasons && item.seasons.length > 0)) {
            controls.classList.remove('hidden');
            const sSelect = document.getElementById('seasonSelect');
            const eSelect = document.getElementById('episodeSelect');

            if (item.seasons && item.seasons.length > 0) {
                // Populate Seasons Dropdown
                sSelect.innerHTML = item.seasons.map(s => `<option value="${s.seasonNumber || 1}">Season ${s.seasonNumber || 1}</option>`).join('');

                // Restore saved Season
                if (prog && prog.season) {
                    sSelect.value = prog.season;
                }

                // Populate Episodes based on selected season
                this.onSeasonChange();

                // Restore saved Episode
                if (prog && prog.episodeUrl) {
                    eSelect.value = prog.episodeUrl;
                }

                // Start Playback
                this.playEpisode();
            }
        }
        // --- MOVIE HANDLING ---
        else {
            controls.classList.add('hidden');
            this.setPlayerSource(item.videoUrl);
        }

        // Note: Seekiing happens in 'loadedmetadata' event inside initPlayer
    }

    setPlayerSource(url) {
        const embedPlayer = document.querySelector('#playerPage iframe');
        const plyrContainer = document.querySelector('#playerPage .plyr');
        const rawVideo = document.getElementById('player');

        if (!url) {
            this.showToast("Error: Video link missing");
            return;
        }

        // Detect Iframe Embeds
        const isEmbed = url.includes('/e/') || url.includes('myvidplay') || url.includes('dood') || url.includes('pixel');

        if (isEmbed) {
            if (this.player) this.player.stop();
            if (plyrContainer) plyrContainer.style.display = 'none';
            if (rawVideo) rawVideo.style.display = 'none';

            if (embedPlayer) {
                embedPlayer.classList.remove('hidden');
                embedPlayer.style.display = 'block';
                embedPlayer.src = url;
            }
        } else {
            if (embedPlayer) {
                embedPlayer.classList.add('hidden');
                embedPlayer.style.display = 'none';
                embedPlayer.src = '';
            }
            if (plyrContainer) plyrContainer.style.display = 'block';
            if (rawVideo) rawVideo.style.display = 'block';

            const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
            this.player.source = {
                type: 'video',
                sources: [{ src: url, provider: isYouTube ? 'youtube' : 'html5' }]
            };

            setTimeout(() => this.player.play(), 500);
        }
    }

    onSeasonChange() {
        const sNum = parseInt(document.getElementById('seasonSelect').value);
        const eSelect = document.getElementById('episodeSelect');

        if (!this.activeContent.seasons) return;

        const season = this.activeContent.seasons.find(s => (s.seasonNumber || 1) === sNum);

        if (season) {
            eSelect.innerHTML = season.episodes.map(e => `<option value="${e.videoUrl}">E${e.episodeNumber}: ${e.title}</option>`).join('');
        }
    }

    playEpisode() {
        const url = document.getElementById('episodeSelect').value;
        if (url) this.setPlayerSource(url);
    }

    closePlayer() {
        if (this.player) this.player.stop();
        const embedPlayer = document.querySelector('#playerPage iframe');
        if (embedPlayer) embedPlayer.src = '';

        this.exitFullscreenAndRotate();
        this.stopPlayerUiTimer();
        document.body.style.overflow = 'auto';

        if (this.activeContent) {
            this.currentView = 'details';
            this.switchView('detailsPage');
            this.updateURL('details', this.activeContent.id);
        } else {
            this.showHome();
        }
    }

    // ==========================================
    // 16. PLAYER UI & FULLSCREEN UTILS
    // ==========================================

    setupPlayerUI() {
        const playerPage = document.getElementById('playerPage');
        if (!playerPage) return;

        const showUI = () => {
            playerPage.classList.remove('player-ui-hidden');
            this.resetPlayerUiTimer();
        };

        playerPage.onmousemove = showUI;
        playerPage.ontouchstart = showUI;
        playerPage.onclick = showUI;

        this.resetPlayerUiTimer();
    }

    resetPlayerUiTimer() {
        this.stopPlayerUiTimer();
        this.playerUiTimeout = setTimeout(() => {
            const playerPage = document.getElementById('playerPage');
            if (playerPage && this.currentView === 'player') {
                playerPage.classList.add('player-ui-hidden');
            }
        }, 3000);
    }

    stopPlayerUiTimer() {
        if (this.playerUiTimeout) {
            clearTimeout(this.playerUiTimeout);
            this.playerUiTimeout = null;
        }
    }

    async enterFullscreenAndRotate() {
        const playerPage = document.getElementById('playerPage');
        if (!playerPage) return;

        try {
            if (playerPage.requestFullscreen) {
                await playerPage.requestFullscreen();
            } else if (playerPage.webkitRequestFullscreen) {
                await playerPage.webkitRequestFullscreen();
            }

            if (screen.orientation && screen.orientation.lock) {
                await screen.orientation.lock('landscape').catch(e => console.log('Orientation lock not supported'));
            }
        } catch (err) {
            console.log("Fullscreen request failed:", err);
        }
    }

    exitFullscreenAndRotate() {
        if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        }

        if (document.fullscreenElement || document.webkitFullscreenElement) {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(err => console.log(err));
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    }

    setupFullscreenListener() {
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement && this.currentView === 'player') {
                if (screen.orientation && screen.orientation.unlock) {
                    screen.orientation.unlock();
                }
            }
        });
    }

    // ==========================================
    // 17. REVIEWS: FETCH & RENDER
    // ==========================================

    updateReviewUI(isLoggedIn) {
        const inputContainer = document.getElementById('reviewInputContainer');
        const loginContainer = document.getElementById('loginToReview');

        if (isLoggedIn) {
            inputContainer.classList.remove('hidden');
            loginContainer.classList.add('hidden');
            const name = this.user.displayName || (this.user.email ? this.user.email.split('@')[0] : 'User');
            document.getElementById('userReviewName').textContent = name;

            const avatarDiv = document.getElementById('userReviewAvatar');
            if (this.avatar) {
                avatarDiv.innerHTML = `<img src="${this.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;">`;
                avatarDiv.style.background = 'transparent';
                avatarDiv.textContent = '';
            } else {
                avatarDiv.innerHTML = '';
                avatarDiv.textContent = name.charAt(0).toUpperCase();
                avatarDiv.style.background = 'var(--primary)';
            }

        } else {
            inputContainer.classList.add('hidden');
            loginContainer.classList.remove('hidden');
        }
    }

    setRating(val) {
        document.getElementById('ratingValue').value = val;
        document.getElementById('ratingText').textContent = val + '/5';
        const stars = document.querySelectorAll('.star-input');
        stars.forEach(s => {
            if (parseInt(s.dataset.value) <= val) {
                s.classList.add('active', 'fas');
                s.classList.remove('far');
            } else {
                s.classList.remove('active', 'fas');
                s.classList.add('far');
            }
        });
    }

    formatDate(timestamp) {
        const date = new Date(timestamp);
        let hours = date.getHours();
        const minutes = date.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        const strMin = minutes < 10 ? '0' + minutes : minutes;

        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} • ${hours}:${strMin} ${ampm}`;
    }

    fetchReviews(contentId) {
        const reviewsContainer = document.getElementById('reviewsList');
        reviewsContainer.innerHTML = '<p class="text-gray-small">Loading reviews...</p>';

        this.db.ref('reviews/' + contentId).on('value', snap => {
            const data = snap.val();
            if (!data) {
                this.activeReviews = [];
                reviewsContainer.innerHTML = '<p class="text-gray-small">No reviews yet. Be the first to review!</p>';
                if (this.activeContent && this.activeContent.id === contentId) {
                    document.getElementById('detailRating').innerHTML = `<i class="fas fa-star"></i> ${this.activeContent.rating || "N/A"}`;
                }
                return;
            }

            this.activeReviews = Object.entries(data).map(([key, value]) => ({ id: key, ...value })).sort((a, b) => b.timestamp - a.timestamp);

            const total = this.activeReviews.reduce((sum, r) => sum + parseInt(r.rating), 0);
            const avg = (total / this.activeReviews.length).toFixed(1);

            document.getElementById('detailRating').innerHTML = `<i class="fas fa-star"></i> ${avg} (${this.activeReviews.length})`;

            reviewsContainer.innerHTML = this.activeReviews.map(r => {
                let userAvatarHtml = r.userAvatar ? `<img src="${r.userAvatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;">` : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--primary); border-radius: 4px;">${r.userName.charAt(0).toUpperCase()}</div>`;

                let actionsHtml = '';
                if (this.user && r.userId === this.user.uid) {
                    actionsHtml = `
                        <div class="review-actions mt-2 text-end">
                            <button class="btn btn-sm btn-outline-light me-2" onclick="app.editReview('${r.id}')" style="font-size: 0.75rem; padding: 2px 10px; border-radius: 20px;">Edit</button>
                            <button class="btn btn-sm btn-outline-danger" onclick="app.deleteReview('${r.id}')" style="font-size: 0.75rem; padding: 2px 10px; border-radius: 20px;">Delete</button>
                        </div>
                    `;
                }

                return `
                <div class="review-card">
                    <div class="review-header">
                        <div class="d-flex align-items-center gap-2">
                             <div class="review-avatar-small" style="width:24px; height:24px; font-size: 0.7rem; overflow: hidden; padding: 0; background: transparent;">
                                ${userAvatarHtml}
                             </div>
                             <span class="fw-bold" style="font-size: 0.9rem;">${this.escapeHtml(r.userName)}</span>
                        </div>
                        <div class="review-stars">${this.getStarsHtml(r.rating)}</div>
                    </div>
                    <p class="review-text mb-1">${this.escapeHtml(r.text)}</p>
                    <small class="review-date">${this.formatDate(r.timestamp)}</small>
                    ${actionsHtml}
                </div>
            `}).join('');
        });
    }

    getStarsHtml(rating) {
        let html = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= rating) html += '<i class="fas fa-star"></i>';
            else html += '<i class="far fa-star"></i>';
        }
        return html;
    }

    // ==========================================
    // 18. REVIEWS: SUBMIT & EDIT
    // ==========================================

    submitReview(e) {
        e.preventDefault();
        if (!this.user || !this.activeContent) return;

        if (!this.editingReviewId) {
            const existingReview = this.activeReviews.find(r => r.userId === this.user.uid);
            if (existingReview) {
                this.showToast("You have already reviewed this title.");
                return;
            }
        }

        const rating = document.getElementById('ratingValue').value;
        const text = document.getElementById('reviewText').value;

        if (!rating) {
            this.showToast("Please select a star rating.");
            return;
        }

        const reviewData = {
            userId: this.user.uid,
            userName: this.user.displayName || this.user.email.split('@')[0],
            userAvatar: this.avatar,
            rating: parseInt(rating),
            text: text,
            timestamp: Date.now()
        };

        if (this.editingReviewId) {
            this.db.ref('reviews/' + this.activeContent.id + '/' + this.editingReviewId).update(reviewData)
                .then(() => {
                    this.showToast("Review Updated!");
                    this.cancelEdit();
                });
        } else {
            this.db.ref('reviews/' + this.activeContent.id).push().set(reviewData).then(() => {
                this.showToast("Review Posted!");
                this.cancelEdit();
            });
        }
    }

    editReview(reviewId) {
        const review = this.activeReviews.find(r => r.id === reviewId);
        if (!review) return;

        this.editingReviewId = reviewId;
        document.getElementById('reviewText').value = review.text;
        this.setRating(review.rating);

        const submitBtn = document.querySelector('#reviewInputContainer button[type="submit"]');
        submitBtn.textContent = "Update Review";
        submitBtn.classList.remove('btn-danger');
        submitBtn.classList.add('btn-warning');

        let cancelBtn = document.getElementById('cancelEditBtn');
        if (!cancelBtn) {
            cancelBtn = document.createElement('button');
            cancelBtn.id = 'cancelEditBtn';
            cancelBtn.type = 'button';
            cancelBtn.className = 'btn btn-outline-light btn-sm px-4 ms-2';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.onclick = () => this.cancelEdit();
            submitBtn.parentNode.appendChild(cancelBtn);
        }

        document.getElementById('reviewInputContainer').scrollIntoView({ behavior: 'smooth' });
    }

    cancelEdit() {
        this.editingReviewId = null;
        document.getElementById('reviewText').value = '';
        this.setRating(0);
        document.getElementById('ratingValue').value = '';
        document.getElementById('ratingText').textContent = 'Select rating';

        const submitBtn = document.querySelector('#reviewInputContainer button[type="submit"]');
        if (submitBtn) {
            submitBtn.textContent = "Post Review";
            submitBtn.classList.add('btn-danger');
            submitBtn.classList.remove('btn-warning');
        }

        const cancelBtn = document.getElementById('cancelEditBtn');
        if (cancelBtn) cancelBtn.remove();
    }

    deleteReview(reviewId) {
        if (!this.user || !this.activeContent) return;
        if (!confirm("Are you sure you want to delete this review?")) return;

        this.db.ref('reviews/' + this.activeContent.id + '/' + reviewId).remove()
            .then(() => {
                this.showToast("Review Deleted");
                if (this.editingReviewId === reviewId) this.cancelEdit();
            });
    }

    // ==========================================
    // 19. GLOBAL UI RENDERERS (Hero, Lists)
    // ==========================================

    renderNewContent() {
        const container = document.getElementById('newContentGrid');
        if (!container) return;

        const all = [...this.movies, ...this.series].sort((a, b) => b.year - a.year).slice(0, 6);
        container.innerHTML = all.map(i => this.createCard(i)).join('');
    }

    renderHeroCarousel() {
        const indicators = document.getElementById('heroIndicators');
        const slides = document.getElementById('heroSlides');
        if (!indicators || !slides) return;

        const allItems = [...this.movies, ...this.series].sort((a, b) => b.year - a.year).slice(0, 5);
        if (allItems.length === 0) return;

        indicators.innerHTML = '';
        slides.innerHTML = '';

        allItems.forEach((item, index) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.bsTarget = '#heroCarousel';
            btn.dataset.bsSlideTo = index;
            btn.className = index === 0 ? 'active' : '';
            btn.ariaCurrent = index === 0 ? 'true' : 'false';
            btn.ariaLabel = `Slide ${index + 1}`;
            indicators.appendChild(btn);

            const slide = document.createElement('div');
            slide.className = `carousel-item ${index === 0 ? 'active' : ''}`;
            const bgImage = item.backdrop || item.poster;

            slide.innerHTML = `
                <img src="${bgImage}" class="hero-bg-img" alt="${item.title}">
                <div class="hero-overlay"></div>
                <div class="container">
                    <div class="hero-content-wrapper">
                        <h1 class="hero-title">${item.title}</h1>
                        <p class="hero-desc">${item.description || 'No description available.'}</p>
                        <div class="hero-buttons">
                            <button class="hero-btn hero-btn-play" onclick="app.openDetails('${item.id}')">
                                <i class="fas fa-play"></i> Watch Now
                            </button>
                            <button class="hero-btn hero-btn-list" onclick="app.toggleMyList('${item.id}')">
                                <i class="fas fa-plus"></i> My List
                            </button>
                        </div>
                    </div>
                </div>
            `;
            slides.appendChild(slide);
        });
    }

    renderContinueWatching() {
        const container = document.getElementById('continueGrid');
        const section = document.getElementById('continueWatchingSection');
        if (!container || !section) return;

        // Ensure data is loaded
        const all = [...this.movies, ...this.series];
        if (all.length === 0) return;

        // Get IDs that have progress, sorted by last updated
        const progressIds = Object.keys(this.progress).sort((a, b) => {
            return (this.progress[b].lastUpdated || 0) - (this.progress[a].lastUpdated || 0);
        });

        // Map IDs to actual content objects
        const list = progressIds.map(id => all.find(item => item.id === id)).filter(Boolean);

        if (list.length > 0) {
            section.classList.remove('hidden');
            container.innerHTML = list.map(i => this.createCard(i, true)).join('');
        } else {
            section.classList.add('hidden');
        }
    }

    renderMyList() {
        const container = document.getElementById('myListGrid');
        if (!container) return;

        const all = [...this.movies, ...this.series];
        const listItems = all.filter(item => this.myList.includes(item.id));

        container.innerHTML = listItems.length > 0
            ? listItems.map(i => this.createCard(i)).join('')
            : '<p class="text-center w-100 mt-5 text-gray-small">List is empty.</p>';
    }

    renderRelated(genre, currentId, containerId = 'detailRelatedGrid') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const all = [...this.movies, ...this.series];
        const related = all.filter(item => item.id !== currentId && item.type.toLowerCase() === genre.toLowerCase()).slice(0, 4);

        container.innerHTML = related.map(i => this.createCard(i)).join('');
    }

    // ==========================================
    // 20. UTILITY FUNCTIONS
    // ==========================================

    showToast(msg) {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = 'custom-toast';
        toast.textContent = msg;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    handleNavbarScroll() {
        const nav = document.getElementById('mainNavbar');
        window.onscroll = () => nav.classList.toggle('scrolled', window.scrollY > 80);
    }

    updateUI() {
        this.renderNewContent();
        this.renderHeroCarousel();
    }
}

// Start Application
const app = new OussaStreamApp();
