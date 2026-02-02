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
        this.auth = firebase.auth(); 
        this.user = null; 
        this.avatar = null; 
        this.tempAvatarData = null; 

        this.movies = [];
        this.series = [];
        this.myList = [];
        this.progress = {};

        this.activeReviews = [];
        this.editingReviewId = null; 

        this.currentView = 'home';
        this.activeContent = null;
        this.player = null;
        
        this.playerUiTimeout = null;
        this.dataLoaded = { movies: false, series: false };
        this.initialLoadComplete = false;

        this.itemsPerPage = 8;
        this.currentPage = 1;
        this.currentCatalogType = 'all';
        this.activeFilters = { genre: 'all', year: 'all', sort: 'newest' };

        this.isLoginMode = true;
        this.isResetMode = false; 

        window.onpopstate = (event) => this.handlePopState(event);
        this.init();
    }

    init() {
        this.initAuth();
        this.initPlayer();
        this.fetchData();
        this.handleNavbarScroll();
        this.setupSearch();
        this.setupFilters();
        this.setupFullscreenListener();
        
        setTimeout(() => {
            const loader = document.getElementById('loadingOverlay');
            if (loader && this.currentView === 'home') loader.classList.add('hidden');
        }, 2000);
    }

    // --- SECURITY HELPER ---
    escapeHtml(text) {
        if (!text) return text;
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // --- AUTHENTICATION ---
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
                this.cancelEdit(); 
            }
        });
    }

    updateAuthUI(isLoggedIn) {
        const container = document.getElementById('authSection');
        if (!container) return;

        if (isLoggedIn && this.user) {
            let avatarHtml = '';
            if (this.avatar) {
                avatarHtml = `<img src="${this.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;">`;
            } else {
                const letter = (this.user.displayName || this.user.email || 'U').charAt(0).toUpperCase();
                avatarHtml = letter;
            }

            container.innerHTML = `
                <div class="d-flex align-items-center gap-3">
                    <div class="dropdown">
                        <div class="d-flex align-items-center" id="authAvatarBtn" data-bs-toggle="dropdown" aria-expanded="false" style="cursor: pointer;">
                            <div class="auth-avatar">${avatarHtml}</div>
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

    openAuthModal() { this.isResetMode = false; this.updateAuthModalUI(); document.getElementById('authModal').classList.add('show'); }
    closeAuthModal() { document.getElementById('authModal').classList.remove('show'); }
    toggleAuthMode() { this.isLoginMode = !this.isLoginMode; this.updateAuthModalUI(); }
    toggleResetMode() { this.isResetMode = !this.isResetMode; if (!this.isResetMode) { this.isLoginMode = true; } this.updateAuthModalUI(); }

    updateAuthModalUI() {
        const title = document.getElementById('authTitle');
        const btn = document.getElementById('authSubmitBtn');
        const passGroup = document.getElementById('passwordGroup');
        const switchContainer = document.getElementById('authSwitchContainer');
        const forgotLink = document.getElementById('forgotPasswordLink');
        const switchLink = document.querySelector('#authSwitchContainer a');
        const switchText = document.getElementById('authSwitchText');

        if (this.isResetMode) {
            title.textContent = 'Reset Password'; btn.textContent = 'Send Reset Email'; passGroup.style.display = 'none'; switchContainer.style.display = 'none'; 
            passGroup.style.display = 'block'; document.getElementById('authPassword').style.display = 'none'; forgotLink.textContent = 'Back to Sign In';
        } else {
            document.getElementById('authPassword').style.display = 'block'; passGroup.style.display = 'block'; switchContainer.style.display = 'block'; forgotLink.textContent = 'Forgot Password?';
            if (this.isLoginMode) { title.textContent = 'Sign In'; btn.textContent = 'Sign In'; switchText.textContent = 'New to OussaStream? '; switchLink.textContent = 'Sign up now.'; forgotLink.style.display = 'inline-block'; } 
            else { title.textContent = 'Sign Up'; btn.textContent = 'Sign Up'; switchText.textContent = 'Already have an account? '; switchLink.textContent = 'Sign in now.'; forgotLink.style.display = 'none'; }
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
            if (this.isResetMode) { await this.auth.sendPasswordResetEmail(email); this.showToast("Password reset email sent!"); this.toggleResetMode(); return; }
            if (this.isLoginMode) { await this.auth.signInWithEmailAndPassword(email, pass); } else { await this.auth.createUserWithEmailAndPassword(email, pass); }
            this.closeAuthModal();
        } catch (error) { this.showToast(error.message); } finally { btn.disabled = false; this.updateAuthModalUI(); }
    }

    openProfileModal() {
        if (!this.user) return;
        const name = this.user.displayName || (this.user.email ? this.user.email.split('@')[0] : 'User');
        const img = document.getElementById('profileAvatarImg');
        const letter = document.getElementById('profileAvatarLetter');
        if (this.avatar) { img.src = this.avatar; img.style.display = 'block'; letter.style.display = 'none'; } 
        else { img.style.display = 'none'; letter.textContent = name.charAt(0).toUpperCase(); letter.style.display = 'block'; }
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
        if (file.size > 2 * 1024 * 1024) { this.showToast("Image too large. Max 2MB."); return; }
        const reader = new FileReader();
        reader.onload = (e) => { this.resizeImage(e.target.result, 150, 150, (resizedDataUrl) => { this.tempAvatarData = resizedDataUrl; const img = document.getElementById('profileAvatarImg'); const letter = document.getElementById('profileAvatarLetter'); img.src = resizedDataUrl; img.style.display = 'block'; letter.style.display = 'none'; }); };
        reader.readAsDataURL(file);
    }

    resizeImage(base64, maxWidth, maxHeight, callback) {
        const img = new Image(); img.src = base64; img.onload = () => { const canvas = document.createElement('canvas'); let width = img.width; let height = img.height; if (width > height) { if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; } } else { if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; } } canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); callback(canvas.toDataURL('image/jpeg', 0.7)); };
    }

    async handleProfileUpdate(e) {
        e.preventDefault();
        const name = document.getElementById('profileName').value;
        const password = document.getElementById('profilePassword').value;
        try {
            const updates = [];
            if (name && name !== this.user.displayName) { updates.push(this.user.updateProfile({ displayName: name })); }
            if (password) { updates.push(this.user.updatePassword(password)); }
            if (updates.length > 0) { await Promise.all(updates); this.showToast("Profile Updated!"); }
            if (this.tempAvatarData) {
                try { await this.db.ref('users/' + this.user.uid + '/avatar').set(this.tempAvatarData); this.showToast("Avatar Updated!"); this.updateUserReviews(this.user.uid, name || this.user.displayName, this.tempAvatarData); } catch (dbError) { console.error(dbError); this.showToast("Profile updated, but Avatar failed"); }
            } else if (name && name !== this.user.displayName) { this.updateUserReviews(this.user.uid, name, this.avatar); }
            this.closeProfileModal(); this.updateAuthUI(true);
        } catch (error) { if (error.code === 'auth/requires-recent-login') { this.showToast("Please sign in again to change password."); this.logout(); } else { this.showToast(error.message); } }
    }

    updateUserReviews(userId, newName, newAvatar) {
        this.db.ref('reviews').once('value', (snapshot) => {
            const allReviews = snapshot.val(); if (!allReviews) return;
            const updates = {};
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
            if (Object.keys(updates).length > 0) { this.db.ref().update(updates).then(() => console.log("Reviews synced")).catch(err => console.error(err)); }
        });
    }

    logout() { this.auth.signOut(); this.showToast("Signed out successfully."); this.closeProfileModal(); }

    toggleMyList(id) {
        const index = this.myList.indexOf(id);
        if (index > -1) { this.myList.splice(index, 1); this.showToast("Removed from My List"); } else { this.myList.push(id); this.showToast("Added to My List!"); }
        if (this.user) { this.db.ref('users/' + this.user.uid + '/myList').set(this.myList).catch(e => console.log("List save failed")); } else { localStorage.setItem('oussaStreamList', JSON.stringify(this.myList)); }
        if (this.currentView === 'mylist') this.renderMyList();
        this.updateUI();
    }

    updateProgress(id, time, duration) {
        const percent = (time / duration) * 100;
        if (percent > 95) { if (this.progress[id]) delete this.progress[id]; } else { this.progress[id] = { time, percent, lastUpdated: Date.now() }; }
        if (this.user) { this.db.ref('users/' + this.user.uid + '/progress').set(this.progress).catch(e => console.log("Progress save failed")); } else { localStorage.setItem('oussaStreamProgress', JSON.stringify(this.progress)); }
    }

    // --- REVIEWS & RATING ---
    updateReviewUI(isLoggedIn) {
        const inputContainer = document.getElementById('reviewInputContainer'); const loginContainer = document.getElementById('loginToReview');
        if (isLoggedIn) { inputContainer.classList.remove('hidden'); loginContainer.classList.add('hidden'); const name = this.user.displayName || (this.user.email ? this.user.email.split('@')[0] : 'User'); document.getElementById('userReviewName').textContent = name; const avatarDiv = document.getElementById('userReviewAvatar'); if (this.avatar) { avatarDiv.innerHTML = `<img src="${this.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;">`; avatarDiv.style.background = 'transparent'; } else { avatarDiv.innerHTML = ''; avatarDiv.textContent = name.charAt(0).toUpperCase(); avatarDiv.style.background = 'var(--primary)'; } } 
        else { inputContainer.classList.add('hidden'); loginContainer.classList.remove('hidden'); }
    }

    setRating(val) {
        document.getElementById('ratingValue').value = val; document.getElementById('ratingText').textContent = val + '/5';
        const stars = document.querySelectorAll('.star-input');
        stars.forEach(s => { if (parseInt(s.dataset.value) <= val) { s.classList.add('active', 'fas'); s.classList.remove('far'); } else { s.classList.remove('active', 'fas'); s.classList.add('far'); } });
    }

    formatDate(timestamp) {
        const date = new Date(timestamp);
        let hours = date.getHours(); const minutes = date.getMinutes(); const ampm = hours >= 12 ? 'PM' : 'AM'; hours = hours % 12; hours = hours ? hours : 12; const strMin = minutes < 10 ? '0' + minutes : minutes;
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} • ${hours}:${strMin} ${ampm}`;
    }

    fetchReviews(contentId) {
        const reviewsContainer = document.getElementById('reviewsList'); reviewsContainer.innerHTML = '<p class="text-gray-small">Loading reviews...</p>';
        this.db.ref('reviews/' + contentId).on('value', snap => {
            const data = snap.val();
            if (!data) {
                this.activeReviews = []; reviewsContainer.innerHTML = '<p class="text-gray-small">No reviews yet. Be the first to review!</p>';
                if (this.activeContent && this.activeContent.id === contentId) { document.getElementById('detailRating').innerHTML = `<i class="fas fa-star"></i> ${this.activeContent.rating || "N/A"}`; }
                return;
            }
            this.activeReviews = Object.entries(data).map(([key, value]) => ({ id: key, ...value })).sort((a, b) => b.timestamp - a.timestamp);
            const total = this.activeReviews.reduce((sum, r) => sum + parseInt(r.rating), 0);
            const avg = (total / this.activeReviews.length).toFixed(1);
            document.getElementById('detailRating').innerHTML = `<i class="fas fa-star"></i> ${avg} (${this.activeReviews.length})`;
            reviewsContainer.innerHTML = this.activeReviews.map(r => {
                let userAvatarHtml = '';
                if (r.userAvatar) { userAvatarHtml = `<img src="${r.userAvatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;">`; } else { userAvatarHtml = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--primary); border-radius: 4px;">${r.userName.charAt(0).toUpperCase()}</div>`; }
                let actionsHtml = '';
                if (this.user && r.userId === this.user.uid) { actionsHtml = `<div class="review-actions mt-2 text-end"><button class="btn btn-sm btn-outline-light me-2" onclick="app.editReview('${r.id}')" style="font-size: 0.75rem; padding: 2px 10px; border-radius: 20px;">Edit</button><button class="btn btn-sm btn-outline-danger" onclick="app.deleteReview('${r.id}')" style="font-size: 0.75rem; padding: 2px 10px; border-radius: 20px;">Delete</button></div>`; }
                const safeText = this.escapeHtml(r.text); const safeUserName = this.escapeHtml(r.userName);
                return `<div class="review-card"><div class="review-header"><div class="d-flex align-items-center gap-2"><div class="review-avatar-small" style="width:24px; height:24px; font-size: 0.7rem; overflow: hidden; padding: 0; background: transparent;">${userAvatarHtml}</div><span class="fw-bold" style="font-size: 0.9rem;">${safeUserName}</span></div><div class="review-stars">${this.getStarsHtml(r.rating)}</div></div><p class="review-text mb-1">${safeText}</p><small class="review-date">${this.formatDate(r.timestamp)}</small>${actionsHtml}</div>`;
            }).join('');
        });
    }

    getStarsHtml(rating) { let html = ''; for (let i = 1; i <= 5; i++) { if (i <= rating) html += '<i class="fas fa-star"></i>'; else html += '<i class="far fa-star"></i>'; } return html; }

    submitReview(e) {
        e.preventDefault(); if (!this.user || !this.activeContent) return;
        if (!this.editingReviewId) { const existingReview = this.activeReviews.find(r => r.userId === this.user.uid); if (existingReview) { this.showToast("You have already reviewed this title. Edit your existing review instead."); return; } }
        const rating = document.getElementById('ratingValue').value; const text = document.getElementById('reviewText').value;
        if (!rating) { this.showToast("Please select a star rating."); return; }
        const reviewData = { userId: this.user.uid, userName: this.user.displayName || this.user.email.split('@')[0], userAvatar: this.avatar, rating: parseInt(rating), text: text, timestamp: Date.now() };
        if (this.editingReviewId) {
            this.db.ref('reviews/' + this.activeContent.id + '/' + this.editingReviewId).update(reviewData).then(() => { this.showToast("Review Updated!"); this.cancelEdit(); }).catch(err => { console.error(err); this.showToast("Failed to update."); });
        } else {
            this.db.ref('reviews/' + this.activeContent.id).push(reviewData).then(() => { this.showToast("Review Posted!"); this.cancelEdit(); }).catch(err => { console.error(err); this.showToast("Failed to post review."); });
        }
    }

    editReview(reviewId) {
        const review = this.activeReviews.find(r => r.id === reviewId); if (!review) return;
        this.editingReviewId = reviewId; document.getElementById('reviewText').value = review.text; this.setRating(review.rating);
        const submitBtn = document.querySelector('#reviewInputContainer button[type="submit"]'); submitBtn.textContent = "Update Review"; submitBtn.classList.remove('btn-danger'); submitBtn.classList.add('btn-warning');
        let cancelBtn = document.getElementById('cancelEditBtn');
        if (!cancelBtn) { cancelBtn = document.createElement('button'); cancelBtn.id = 'cancelEditBtn'; cancelBtn.type = 'button'; cancelBtn.className = 'btn btn-outline-light btn-sm px-4 ms-2'; cancelBtn.textContent = 'Cancel'; cancelBtn.onclick = () => this.cancelEdit(); submitBtn.parentNode.appendChild(cancelBtn); }
        document.getElementById('reviewInputContainer').scrollIntoView({ behavior: 'smooth' });
    }

    cancelEdit() {
        this.editingReviewId = null; document.getElementById('reviewText').value = ''; this.setRating(0); document.getElementById('ratingValue').value = ''; document.getElementById('ratingText').textContent = 'Select rating';
        const submitBtn = document.querySelector('#reviewInputContainer button[type="submit"]'); if (submitBtn) { submitBtn.textContent = "Post Review"; submitBtn.classList.add('btn-danger'); submitBtn.classList.remove('btn-warning'); }
        const cancelBtn = document.getElementById('cancelEditBtn'); if (cancelBtn) cancelBtn.remove();
    }

    deleteReview(reviewId) {
        if (!this.user || !this.activeContent) return;
        if (!confirm("Delete this review?")) return;
        this.db.ref('reviews/' + this.activeContent.id + '/' + reviewId).remove().then(() => { this.showToast("Review Deleted"); if (this.editingReviewId === reviewId) this.cancelEdit(); }).catch(err => this.showToast(err.message));
    }

    // --- MAIN APP LOGIC ---
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
            this.dataLoaded.movies = true;
            this.checkUrlParams(); // Check URL after loading data
            if (this.currentView === 'movies') this.renderCatalog('movie');
            this.updateUI();
        });
        this.db.ref('series').on('value', snap => {
            const data = snap.val();
            this.series = data ? Object.keys(data).map(k => ({ id: k, type: 'series', ...data[k] })) : [];
            this.dataLoaded.series = true;
            this.checkUrlParams(); // Check URL after loading data
            if (this.currentView === 'series') this.renderCatalog('series');
            this.updateUI();
        });
    }

    // --- REFRESH PERSISTENCE LOGIC ---
    checkUrlParams() {
        if (!this.dataLoaded.movies || !this.dataLoaded.series) return;
        if (this.initialLoadComplete) return;
        this.initialLoadComplete = true;

        const params = new URLSearchParams(window.location.search);
        const view = params.get('view');
        const id = params.get('id');

        const loader = document.getElementById('loadingOverlay');
        if (loader) loader.classList.add('hidden');

        if (view === 'details' && id) {
            this.openDetails(id, true);
        } else if (view === 'player' && id) {
            this.openDetails(id, true); 
            setTimeout(() => this.playActiveMovie(), 500); 
        } else if (view === 'movies') {
            this.showMovies(true);
        } else if (view === 'series') {
            this.showSeries(true);
        } else if (view === 'mylist') {
            this.showMyList(true);
        } else {
            this.renderContinueWatching(); 
        }
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
        document.getElementById('genreSelect').value = 'all'; document.getElementById('yearSelect').value = 'all'; document.getElementById('sortSelect').value = 'newest'; document.getElementById('searchInput').value = '';
    }

    async enterFullscreenAndRotate() {
        const playerPage = document.getElementById('playerPage'); if (!playerPage) return;
        try {
            if (playerPage.requestFullscreen) { await playerPage.requestFullscreen(); } else if (playerPage.webkitRequestFullscreen) { await playerPage.webkitRequestFullscreen(); } else if (playerPage.msRequestFullscreen) { await playerPage.msRequestFullscreen(); }
            if (screen.orientation && screen.orientation.lock) { setTimeout(async () => { try { await screen.orientation.lock('landscape'); console.log("Orientation locked"); } catch (err) { console.log("Orientation lock failed:", err); } }, 200); }
        } catch (err) { console.log("Fullscreen failed:", err); }
    }

    exitFullscreenAndRotate() {
        if (screen.orientation && screen.orientation.unlock) { screen.orientation.unlock(); }
        if (document.exitFullscreen) { document.exitFullscreen().catch(err => console.log(err)); } else if (document.webkitExitFullscreen) { document.webkitExitFullscreen(); }
    }

    setupFullscreenListener() {
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement && this.currentView === 'player') {
                if (screen.orientation && screen.orientation.unlock) { screen.orientation.unlock(); }
            }
        });
    }

    // --- NAVIGATION AND BACK BUTTON HANDLING ---
    handlePopState(event) {
        if (event.state) {
            const view = event.state.view;
            if (view === 'player') {
                if (event.state.id) {
                    this.openDetails(event.state.id, true);
                    this.playActiveMovie(true); 
                }
            } else if (view === 'details' && event.state.id) {
                this.closePlayer(true); 
                this.openDetails(event.state.id, true);
            } else if (view === 'movies') { this.showMovies(true); } 
            else if (view === 'series') { this.showSeries(true); } 
            else if (view === 'mylist') { this.showMyList(true); } 
            else { 
                this.closePlayer(true);
                this.showHome(true); 
            }
        } else {
            this.showHome(true);
        }
    }

    updateURL(view, id = null) {
        let url = `?view=${view}`;
        if (id) url += `&id=${id}`;
        const state = { view, id };
        history.pushState(state, '', url);
    }

    goBack() {
        if (this.currentView === 'player') {
            this.closePlayer();
        } else {
            history.back();
        }
    }

    switchView(id) {
        document.body.style.overflow = 'auto';
        if (this.player) { try { this.player.stop(); } catch (e) {} }
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => { if (iframe.id === 'embedPlayer' || iframe.closest('.player-page')) { iframe.src = ''; } });
        this.stopPlayerUiTimer(); 
        const playerPage = document.getElementById('playerPage');
        if (playerPage) { playerPage.classList.remove('player-ui-hidden'); if (id !== 'playerPage') { playerPage.onmousemove = null; playerPage.ontouchstart = null; playerPage.onclick = null; } }
        ['mainContent', 'catalogPage', 'myListPage', 'detailsPage', 'playerPage'].forEach(p => { const el = document.getElementById(p); if (el) el.classList.toggle('hidden', p !== id); });
        window.scrollTo(0, 0);
    }

    setPlayerSource(url) {
        const embedPlayer = document.querySelector('#playerPage iframe'); const plyrContainer = document.querySelector('#playerPage .plyr'); const rawVideo = document.getElementById('player');
        if (!url) { this.showToast("Error: Video link missing"); return; }
        const isEmbed = url.includes('/e/') || url.includes('myvidplay') || url.includes('dood') || url.includes('pixel');
        if (isEmbed) {
            if (this.player) this.player.stop(); if (plyrContainer) plyrContainer.style.display = 'none'; if (rawVideo) rawVideo.style.display = 'none';
            if (embedPlayer) { embedPlayer.classList.remove('hidden'); embedPlayer.style.display = 'block'; embedPlayer.src = url; }
        } else {
            if (embedPlayer) { embedPlayer.classList.add('hidden'); embedPlayer.style.display = 'none'; embedPlayer.src = ''; }
            if (plyrContainer) plyrContainer.style.display = 'block'; if (rawVideo) rawVideo.style.display = 'block';
            const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
            this.player.source = { type: 'video', sources: [{ src: url, provider: isYouTube ? 'youtube' : 'html5' }] }; setTimeout(() => this.player.play(), 500);
        }
    }

    onSeasonChange() {
        const sNum = parseInt(document.getElementById('seasonSelect').value);
        const eSelect = document.getElementById('episodeSelect');
        if (!this.activeContent.seasons) return;
        const season = this.activeContent.seasons.find(s => (s.seasonNumber || 1) === sNum);
        if (season) { eSelect.innerHTML = season.episodes.map(e => `<option value="${e.videoUrl}">E${e.episodeNumber}: ${e.title}</option>`).join(''); }
    }

    playEpisode() { const url = document.getElementById('episodeSelect').value; if (url) this.setPlayerSource(url); }

    playActiveMovie(fromHistory = false) {
        if (!this.activeContent) return;
        const item = this.activeContent;
        
        if (!fromHistory) {
            this.updateURL('player', item.id);
        }

        const controls = document.getElementById('seriesControls');
        const playerTitle = document.getElementById('playerTitle');
        this.switchView('playerPage');
        this.currentView = 'player';
        this.setupPlayerUI();
        if (window.innerWidth < 768) { this.enterFullscreenAndRotate(); }
        if (playerTitle) playerTitle.textContent = `Now Watching: ${item.title}`;
        if (item.type === 'series' || (item.seasons && item.seasons.length > 0)) {
            controls.classList.remove('hidden');
            const sSelect = document.getElementById('seasonSelect');
            if (item.seasons && item.seasons.length > 0) {
                sSelect.innerHTML = item.seasons.map(s => `<option value="${s.seasonNumber || 1}">Season ${s.seasonNumber || 1}</option>`).join('');
                this.onSeasonChange();
            } else { controls.classList.add('hidden'); if (item.videoUrl) this.setPlayerSource(item.videoUrl); }
        } else { controls.classList.add('hidden'); this.setPlayerSource(item.videoUrl); }
        const prog = this.progress[item.id];
        if (prog && this.player) { this.player.once('ready', () => { this.player.currentTime = prog.time; }); }
    }

    closePlayer(fromHistory = false) {
        if (this.player) this.player.stop();
        const embedPlayer = document.querySelector('#playerPage iframe');
        if (embedPlayer) embedPlayer.src = ''; 
        this.exitFullscreenAndRotate();
        this.stopPlayerUiTimer(); 
        document.body.style.overflow = 'auto';

        if (this.activeContent) {
            this.currentView = 'details';
            if (!fromHistory) {
                history.back(); 
            } else {
                this.switchView('detailsPage');
            }
        } else {
            this.showHome();
        }
    }

    updateUI() { this.renderNewContent(); this.renderHeroCarousel(); }
}

const app = new OussaStreamApp();
