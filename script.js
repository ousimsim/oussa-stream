// 1. Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAMxFcc8nt3RgsodtGBUw-jYEZu6Ui4NIA",
    authDomain: "oussastream.firebaseapp.com",
    databaseURL: "https://oussastream-default-rtdb.firebaseio.com",
    projectId: "oussastream",
    storageBucket: "oussastream.firebasestorage.app",
    messagingSenderId: "12799093969",
    appId: "1:12799093969:web:fc044c5c7b3c78a1e3e9f0"
};

firebase.initializeApp(firebaseConfig);

class OussaStreamApp {
    constructor() {
        this.db = firebase.database();
        this.auth = firebase.auth(); // Init Auth
        this.user = null; // Store current user
        this.avatar = null; // Store avatar base64
        this.tempAvatarData = null; // For preview before saving

        this.movies = [];
        this.series = [];
        this.myList = [];
        this.progress = {};

        // Reviews Data
        this.activeReviews = [];

        this.currentView = 'home';
        this.activeContent = null;
        this.player = null;

        // Player UI Timeout Variable
        this.playerUiTimeout = null;

        this.itemsPerPage = 8;
        this.currentPage = 1;
        this.currentCatalogType = 'all';
        this.activeFilters = { genre: 'all', year: 'all', sort: 'newest' };

        this.isLoginMode = true;
        this.isResetMode = false; // Add reset state

        window.onpopstate = (event) => this.handlePopState(event);
        this.init();
    }

    init() {
        // Auth listener starts immediately but waits for Firebase response
        this.initAuth();
        this.initPlayer();
        this.fetchData();
        this.handleNavbarScroll();
        this.setupSearch();
        this.setupFilters();

        setTimeout(() => {
            const loader = document.getElementById('loadingOverlay');
            if (loader) loader.classList.add('hidden');
            this.renderContinueWatching();
        }, 1500);
    }

    // --- AUTHENTICATION LOGIC ---

    initAuth() {
        this.auth.onAuthStateChanged((user) => {
            if (user) {
                this.user = user;
                this.updateAuthUI(true);
                this.loadUserData(user.uid);
                this.updateReviewUI(true);
                const name = user.displayName || (user.email ? user.email.split('@')[0] : 'User');
                setTimeout(() => this.showToast(`Welcome back, ${name}!`), 500);
            } else {
                this.user = null;
                this.avatar = null;
                this.updateAuthUI(false);
                this.updateReviewUI(false);
                this.myList = JSON.parse(localStorage.getItem('oussaStreamList')) || [];
                this.progress = JSON.parse(localStorage.getItem('oussaStreamProgress')) || {};
                this.updateUI();
            }
        });
    }

    updateAuthUI(isLoggedIn) {
        const container = document.getElementById('authSection');
        if (!container) return; // Guard clause

        if (isLoggedIn && this.user) {
            const name = this.user.displayName || (this.user.email ? this.user.email.split('@')[0] : 'User');
            let avatarHtml = '';

            // Show Image if available, else Show Letter
            if (this.avatar) {
                avatarHtml = `<img src="${this.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;">`;
            } else {
                // Use first letter of name or email
                const letter = name.charAt(0).toUpperCase();
                avatarHtml = letter;
            }

            // UPDATED: Removed Name Span, only Avatar remains
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

    loadUserData(uid) {
        this.db.ref('users/' + uid + '/avatar').on('value', (snap) => {
            this.avatar = snap.val() || null;
            this.updateAuthUI(true);
        });

        this.db.ref('users/' + uid + '/myList').on('value', snap => {
            this.myList = snap.val() || [];
            if (this.currentView === 'mylist') this.renderMyList();
            this.updateUI();
        });

        this.db.ref('users/' + uid + '/progress').on('value', snap => {
            this.progress = snap.val() || {};
            this.renderContinueWatching();
        });
    }

    openAuthModal() {
        this.isResetMode = false;
        this.updateAuthModalUI();
        document.getElementById('authModal').classList.add('show');
    }

    closeAuthModal() { document.getElementById('authModal').classList.remove('show'); }

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
            passGroup.style.display = 'block';
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
        }
    }

    // --- PROFILE & AVATAR MANAGEMENT ---

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

    closeProfileModal() { document.getElementById('profileModal').classList.remove('show'); }

    handleAvatarSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            this.showToast("Image too large. Max 2MB.");
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
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
            if (width > height) {
                if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
            } else {
                if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.7));
        };
    }

    async handleProfileUpdate(e) {
        e.preventDefault();
        const name = document.getElementById('profileName').value;
        const password = document.getElementById('profilePassword').value;

        try {
            const updates = [];

            if (name && name !== this.user.displayName) {
                updates.push(this.user.updateProfile({ displayName: name }));
            }

            if (password) {
                updates.push(this.user.updatePassword(password));
            }

            if (updates.length > 0) {
                await Promise.all(updates);
                this.showToast("Profile Updated!");
            }

            if (this.tempAvatarData) {
                try {
                    await this.db.ref('users/' + this.user.uid + '/avatar').set(this.tempAvatarData);
                    this.showToast("Avatar Updated!");
                } catch (dbError) {
                    console.error("Avatar upload failed:", dbError);
                    this.showToast("Profile updated, but Avatar failed (Check DB Rules)");
                }
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

    logout() {
        this.auth.signOut();
        this.showToast("Signed out successfully.");
        this.closeProfileModal();
    }

    // --- DATA HANDLING ---

    toggleMyList(id) {
        const index = this.myList.indexOf(id);
        if (index > -1) {
            this.myList.splice(index, 1);
            this.showToast("Removed from My List");
        } else {
            this.myList.push(id);
            this.showToast("Added to My List!");
        }

        if (this.user) {
            this.db.ref('users/' + this.user.uid + '/myList').set(this.myList)
                .catch(e => console.log("List save failed (permission)"));
        } else {
            localStorage.setItem('oussaStreamList', JSON.stringify(this.myList));
        }

        if (this.currentView === 'mylist') this.renderMyList();
        this.updateUI();
    }

    updateProgress(id, time, duration) {
        const percent = (time / duration) * 100;
        if (percent > 95) { if (this.progress[id]) delete this.progress[id]; }
        else { this.progress[id] = { time, percent, lastUpdated: Date.now() }; }

        if (this.user) {
            this.db.ref('users/' + this.user.uid + '/progress').set(this.progress)
                .catch(e => console.log("Progress save failed (permission)"));
        } else {
            localStorage.setItem('oussaStreamProgress', JSON.stringify(this.progress));
        }
    }

    // --- REVIEWS SYSTEM ---

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

    timeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + " years ago";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + " months ago";
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + " days ago";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + " hours ago";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + " minutes ago";
        return Math.floor(seconds) + " seconds ago";
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

            this.activeReviews = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);

            const total = this.activeReviews.reduce((sum, r) => sum + parseInt(r.rating), 0);
            const avg = (total / this.activeReviews.length).toFixed(1);

            document.getElementById('detailRating').innerHTML = `<i class="fas fa-star"></i> ${avg} (${this.activeReviews.length})`;

            reviewsContainer.innerHTML = this.activeReviews.map(r => {
                let userAvatarHtml = '';
                if (r.userAvatar) {
                    userAvatarHtml = `<img src="${r.userAvatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;">`;
                } else {
                    userAvatarHtml = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--primary); border-radius: 4px;">${r.userName.charAt(0).toUpperCase()}</div>`;
                }

                return `
                <div class="review-card">
                    <div class="review-header">
                        <div class="d-flex align-items-center gap-2">
                             <div class="review-avatar-small" style="width:24px; height:24px; font-size: 0.7rem; overflow: hidden; padding: 0; background: transparent;">
                                ${userAvatarHtml}
                             </div>
                             <span class="fw-bold" style="font-size: 0.9rem;">${r.userName}</span>
                        </div>
                        <div class="review-stars">
                            ${this.getStarsHtml(r.rating)}
                        </div>
                    </div>
                    <p class="review-text mb-1">${r.text}</p>
                    <small class="review-date">${this.timeAgo(r.timestamp)}</small>
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

    submitReview(e) {
        e.preventDefault();
        if (!this.user || !this.activeContent) return;

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

        const newReviewRef = this.db.ref('reviews/' + this.activeContent.id).push();
        newReviewRef.set(reviewData).then(() => {
            this.showToast("Review Posted!");
            document.getElementById('reviewText').value = '';
            this.setRating(0);
            document.getElementById('ratingValue').value = '';
            document.getElementById('ratingText').textContent = 'Select rating';
        }).catch(err => {
            console.error(err);
            this.showToast("Failed to post review. Check permissions.");
        });
    }

    // --- BASE LOGIC ---
    initPlayer() {
        this.player = new Plyr('#player', { controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'] });
        this.player.on('timeupdate', () => {
            if (this.activeContent && this.player.duration > 0) {
                const currentTime = this.player.currentTime;
                const duration = this.player.duration;
                if (currentTime > 10) { this.updateProgress(this.activeContent.id, currentTime, duration); }
            }
        });
    }

    fetchData() {
        this.db.ref('movies').on('value', snap => {
            const data = snap.val();
            this.movies = data ? Object.keys(data).map(k => ({ id: k, type: 'movie', ...data[k] })) : [];
            this.populateYearFilter();
            if (this.currentView === 'movies') this.renderCatalog('movie');
            this.updateUI();
        });
        this.db.ref('series').on('value', snap => {
            const data = snap.val();
            this.series = data ? Object.keys(data).map(k => ({ id: k, type: 'series', ...data[k] })) : [];
            this.populateYearFilter();
            if (this.currentView === 'series') this.renderCatalog('series');
            this.updateUI();
        });
    }

    populateYearFilter() {
        const yearSelect = document.getElementById('yearSelect');
        const allItems = [...this.movies, ...this.series];
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

    showHome(fromHistory = false) { this.currentView = 'home'; this.switchView('mainContent'); this.renderContinueWatching(); if (!fromHistory) this.updateURL('home'); }
    showMovies(fromHistory = false) { this.currentView = 'movies'; this.currentPage = 1; this.currentCatalogType = 'movie'; this.resetFiltersUI(); document.getElementById('pageTitle').textContent = 'Movies'; this.renderCatalog('movie'); this.switchView('catalogPage'); if (!fromHistory) this.updateURL('movies'); }
    showSeries(fromHistory = false) { this.currentView = 'series'; this.currentPage = 1; this.currentCatalogType = 'series'; this.resetFiltersUI(); document.getElementById('pageTitle').textContent = 'TV Series'; this.renderCatalog('series'); this.switchView('catalogPage'); if (!fromHistory) this.updateURL('series'); }
    showMyList(fromHistory = false) { this.currentView = 'mylist'; this.renderMyList(); this.switchView('myListPage'); if (!fromHistory) this.updateURL('mylist'); }

    resetFiltersUI() {
        this.activeFilters = { genre: 'all', year: 'all', sort: 'newest' };
        document.getElementById('genreSelect').value = 'all';
        document.getElementById('yearSelect').value = 'all';
        document.getElementById('sortSelect').value = 'newest';
        document.getElementById('searchInput').value = '';
    }

    // --- CRITICAL FIX: STOP VIDEO WHEN SWITCHING VIEWS ---
    switchView(id) {
        // 1. Reset scrolling
        document.body.style.overflow = 'auto';

        // 2. FORCE STOP PLYR VIDEO
        if (this.player) {
            try { this.player.stop(); } catch (e) { }
        }

        // 3. FORCE STOP ALL IFRAMES (Doodstream/Vidplay/YouTube)
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            if (iframe.id === 'embedPlayer' || iframe.closest('.player-page') || iframe.closest('.video-container') || iframe.closest('#videoModal')) {
                iframe.src = '';
            }
        });

        // 4. Reset Player UI
        this.stopPlayerUiTimer(); // Clear any existing timer
        const playerPage = document.getElementById('playerPage');
        if (playerPage) {
            playerPage.classList.remove('player-ui-hidden'); // Show UI by default

            // Remove event listeners to prevent memory leaks when leaving player page
            if (id !== 'playerPage') {
                playerPage.onmousemove = null;
                playerPage.ontouchstart = null;
                playerPage.onclick = null;
            }
        }

        // 5. Toggle Views
        ['mainContent', 'catalogPage', 'myListPage', 'detailsPage', 'playerPage'].forEach(p => {
            const el = document.getElementById(p);
            if (el) el.classList.toggle('hidden', p !== id);
        });

        window.scrollTo(0, 0);
    }

    renderCatalog(typeFilter) {
        const container = document.getElementById('catalogGrid');
        if (!container) return;
        let data = typeFilter === 'movie' ? this.movies : this.series;

        const query = document.getElementById('searchInput').value.toLowerCase();
        if (query) data = data.filter(i => i.title.toLowerCase().includes(query));

        if (this.activeFilters.genre !== 'all') {
            data = data.filter(item => {
                const itemGenre = (item.genre || item.type || "").toLowerCase();
                return itemGenre.includes(this.activeFilters.genre.toLowerCase());
            });
        }

        if (this.activeFilters.year !== 'all') { data = data.filter(item => item.year == this.activeFilters.year); }

        data.sort((a, b) => {
            if (this.activeFilters.sort === 'newest') return (b.year || 0) - (a.year || 0);
            if (this.activeFilters.sort === 'oldest') return (a.year || 0) - (b.year || 0);
            if (this.activeFilters.sort === 'rating') return (b.rating || 0) - (a.rating || 0);
            return 0;
        });

        if (data.length === 0) { container.innerHTML = '<div class="col-12 text-center mt-5 text-muted"><h3>No results found.</h3></div>'; document.getElementById('paginationControls').innerHTML = ''; return; }

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
        controls.innerHTML = `<button class="page-btn" onclick="app.changePage(-1)" ${this.currentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i> Prev</button><span class="page-info">Page ${this.currentPage} of ${totalPages}</span><button class="page-btn" onclick="app.changePage(1)" ${this.currentPage === totalPages ? 'disabled' : ''}>Next <i class="fas fa-chevron-right"></i></button>`;
    }

    changePage(direction) { this.currentPage += direction; this.renderCatalog(this.currentCatalogType); window.scrollTo(0, 0); }

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
        return `<div class="content-card" onclick="app.openDetails('${item.id}')">${item.type === 'series' ? '<span class="badge-series">Series</span>' : ''}<img src="${item.poster}" alt="${item.title}" class="card-img" loading="lazy">${isContinue && prog ? `<div class="progress-container"><div class="progress-bar" style="width: ${prog.percent}%"></div></div>` : ''}<div class="card-overlay"><h5 class="card-title">${item.title}</h5><div class="card-buttons"><button class="play-btn"><i class="fas fa-play"></i> ${isContinue ? 'Resume' : 'Info'}</button><button class="list-btn" onclick="event.stopPropagation(); app.toggleMyList('${item.id}')"><i class="${heartClass}"></i></button></div></div></div>`;
    }

    openDetails(id, fromHistory = false) {
        const all = [...this.movies, ...this.series];
        const item = all.find(x => x.id === id);
        if (!item) return;
        this.activeContent = item;
        this.currentView = 'details';
        if (!fromHistory) this.updateURL('details', id);

        const hero = document.getElementById('detailHero');
        const bgImage = item.backdrop || item.poster;
        hero.style.backgroundImage = `url('${bgImage}')`;

        document.getElementById('detailPoster').src = item.poster;
        document.getElementById('detailTitle').textContent = item.title;
        document.getElementById('detailDesc').textContent = item.description || "No description available.";
        document.getElementById('detailYear').textContent = item.year || "N/A";
        document.getElementById('detailRating').innerHTML = `<i class="fas fa-star"></i> ${item.rating || "N/A"}`;
        document.getElementById('detailGenre').textContent = item.genre || item.type.toUpperCase();

        const playBtn = document.getElementById('detailPlayBtn');
        const listBtn = document.getElementById('detailListBtn');

        playBtn.onclick = () => this.playActiveMovie();
        this.updateDetailListBtn(item.id);
        listBtn.onclick = () => { this.toggleMyList(item.id); this.updateDetailListBtn(item.id); };

        // RESTORED: Fetch Reviews and Update UI
        this.fetchReviews(id);
        this.updateReviewUI(!!this.user);

        // Use small grid for side-by-side layout
        this.renderRelated(item.type, item.id, 'detailRelatedGrid');

        this.switchView('detailsPage');
    }

    updateDetailListBtn(id) { const btn = document.getElementById('detailListBtn'); if (this.myList.includes(id)) { btn.innerHTML = '<i class="fas fa-check"></i> Added'; btn.classList.add('btn-light'); btn.classList.remove('btn-outline-light'); } else { btn.innerHTML = '<i class="far fa-heart"></i> My List'; btn.classList.add('btn-outline-light'); btn.classList.remove('btn-light'); } }

    // --- PLAYER UI LOGIC (AUTO-HIDE) ---
    setupPlayerUI() {
        const playerPage = document.getElementById('playerPage');
        if (!playerPage) return;

        // Function to show UI and reset timer
        const showUI = () => {
            playerPage.classList.remove('player-ui-hidden');
            this.resetPlayerUiTimer();
        };

        // Event listeners for activity
        playerPage.onmousemove = showUI;
        playerPage.ontouchstart = showUI;
        playerPage.onclick = showUI;

        // Initial setup: start timer immediately
        this.resetPlayerUiTimer();
    }

    resetPlayerUiTimer() {
        this.stopPlayerUiTimer();
        // Hide UI after 3 seconds of inactivity
        this.playerUiTimeout = setTimeout(() => {
            const playerPage = document.getElementById('playerPage');
            // Only hide if we are currently viewing the player page
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

    playActiveMovie() {
        if (!this.activeContent) return;
        const item = this.activeContent;
        const controls = document.getElementById('seriesControls');
        const playerTitle = document.getElementById('playerTitle');

        this.switchView('playerPage');
        this.currentView = 'player';

        // Initialize Auto-Hide Logic
        this.setupPlayerUI();

        if (playerTitle) playerTitle.textContent = `Now Watching: ${item.title}`;

        if (item.type === 'series' || (item.seasons && item.seasons.length > 0)) {
            controls.classList.remove('hidden');
            const sSelect = document.getElementById('seasonSelect');

            if (item.seasons && item.seasons.length > 0) {
                sSelect.innerHTML = item.seasons.map(s => `<option value="${s.seasonNumber || 1}">Season ${s.seasonNumber || 1}</option>`).join('');
                this.onSeasonChange();
            } else {
                controls.classList.add('hidden');
                if (item.videoUrl) this.setPlayerSource(item.videoUrl);
            }
        } else {
            controls.classList.add('hidden');
            this.setPlayerSource(item.videoUrl);
        }

        const prog = this.progress[item.id];
        if (prog && this.player) { this.player.once('ready', () => { this.player.currentTime = prog.time; }); }
    }

    renderNewContent() { const container = document.getElementById('newContentGrid'); if (!container) return; const all = [...this.movies, ...this.series].sort((a, b) => b.year - a.year).slice(0, 6); container.innerHTML = all.map(i => this.createCard(i)).join(''); }

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
        const all = [...this.movies, ...this.series];
        const progressIds = Object.keys(this.progress).sort((a, b) => this.progress[b].lastUpdated - this.progress[a].lastUpdated);
        const list = progressIds.map(id => all.find(item => item.id === id)).filter(Boolean);
        if (list.length > 0) { section.classList.remove('hidden'); container.innerHTML = list.map(i => this.createCard(i, true)).join(''); } else { section.classList.add('hidden'); }
    }

    renderMyList() { const container = document.getElementById('myListGrid'); if (!container) return; const all = [...this.movies, ...this.series]; const listItems = all.filter(item => this.myList.includes(item.id)); container.innerHTML = listItems.length > 0 ? listItems.map(i => this.createCard(i)).join('') : '<p class="text-center w-100 mt-5 text-gray-small">List is empty.</p>'; }

    renderRelated(genre, currentId, containerId = 'relatedGrid') { const container = document.getElementById(containerId); if (!container) return; const all = [...this.movies, ...this.series]; const related = all.filter(item => item.id !== currentId && item.type.toLowerCase() === genre.toLowerCase()).slice(0, 4); container.innerHTML = related.map(i => this.createCard(i)).join(''); }

    renderCast() {
        const castContainer = document.getElementById('detailCast');
        const fakeCast = [{ name: "Actor One", img: "https://i.pravatar.cc/150?img=1" }, { name: "Actress Two", img: "https://i.pravatar.cc/150?img=5" }, { name: "Star Three", img: "https://i.pravatar.cc/150?img=8" }, { name: "Co-Star Four", img: "https://i.pravatar.cc/150?img=12" }];
        castContainer.innerHTML = fakeCast.map(actor => `<div class="cast-member"><img src="${actor.img}" class="cast-avatar"><div class="small text-muted" style="font-size: 0.8rem">${actor.name}</div></div>`).join('');
    }

    handlePopState(event) { if (event.state) { const view = event.state.view; if (view === 'details' && event.state.id) { this.openDetails(event.state.id, true); } else if (view === 'movies') { this.showMovies(true); } else if (view === 'series') { this.showSeries(true); } else if (view === 'mylist') { this.showMyList(true); } else { this.showHome(true); } } else { this.showHome(true); } }

    updateURL(view, id = null) { let url = `?view=${view}`; if (id) url += `&id=${id}`; const state = { view, id }; history.pushState(state, '', url); }

    goBack() {
        if (this.currentView === 'player') {
            this.closePlayer();
        } else {
            history.back();
        }
    }

    showToast(msg) { const container = document.getElementById('toastContainer'); const toast = document.createElement('div'); toast.className = 'custom-toast'; toast.textContent = msg; container.appendChild(toast); setTimeout(() => toast.remove(), 3500); }

    handleNavbarScroll() { const nav = document.getElementById('mainNavbar'); window.onscroll = () => nav.classList.toggle('scrolled', window.scrollY > 80); }

    setupSearch() { const input = document.getElementById('searchInput'); if (input) input.addEventListener('input', () => { if (this.currentView !== 'movies' && this.currentView !== 'series') { this.showMovies(); } if (this.currentCatalogType === 'movie') this.renderCatalog('movie'); else if (this.currentCatalogType === 'series') this.renderCatalog('series'); }); }

    // UPDATED: Robust Video Handler using specific selectors to avoid ID conflicts
    setPlayerSource(url) {
        // Target specifically the iframe inside the Player Page
        const embedPlayer = document.querySelector('#playerPage iframe');
        const plyrContainer = document.querySelector('#playerPage .plyr');
        const rawVideo = document.getElementById('player'); // raw plyr video

        if (!url) {
            this.showToast("Error: Video link missing");
            return;
        }

        const isEmbed = url.includes('/e/') || url.includes('myvidplay') || url.includes('dood') || url.includes('pixel');

        if (isEmbed) {
            // --- CASE 1: EMBED ---
            if (this.player) this.player.stop();

            if (plyrContainer) plyrContainer.style.display = 'none';
            if (rawVideo) rawVideo.style.display = 'none';

            if (embedPlayer) {
                embedPlayer.classList.remove('hidden');
                embedPlayer.style.display = 'block';
                embedPlayer.src = url;
            }
        } else {
            // --- CASE 2: DIRECT FILE (MP4 / YouTube) ---
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

    playEpisode() { const url = document.getElementById('episodeSelect').value; if (url) this.setPlayerSource(url); }

    // UPDATED: Explicit Close Player
    closePlayer() {
        // Stop Plyr
        if (this.player) this.player.stop();

        // Stop Iframe
        const embedPlayer = document.querySelector('#playerPage iframe');
        if (embedPlayer) embedPlayer.src = '';

        this.stopPlayerUiTimer(); // Reset UI timer
        document.body.style.overflow = 'auto';

        if (this.activeContent) {
            this.currentView = 'details';
            this.switchView('detailsPage');
        } else {
            this.showHome();
        }
    }

    updateUI() {
        this.renderNewContent();
        this.renderHeroCarousel();
    }
}

const app = new OussaStreamApp();