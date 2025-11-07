  // 1. COLLEZ VOTRE CONFIGURATION PERSONNELLE DE FIREBASE ICI
        const firebaseConfig = {
             apiKey: "AIzaSyAMxFcc8nt3RgsodtGBUw-jYEZu6Ui4NIA",
  authDomain: "oussastream.firebaseapp.com",
  databaseURL: "https://oussastream-default-rtdb.firebaseio.com",
  projectId: "oussastream",
  storageBucket: "oussastream.firebasestorage.app",
  messagingSenderId: "12799093969",
  appId: "1:12799093969:web:fc044c5c7b3c78a1e3e9f0"
        };

        // Initialize Firebase
        firebase.initializeApp(firebaseConfig);

        class OussaStreamApp {
            constructor() {
                // Pagination settings
                this.currentPage = 1;
                this.moviesPerPage = 12;
                this.seriesCurrentPage = 1;
                this.seriesPerPage = 12;
                
                // Filter settings
                this.currentMovieFilter = 'all';
                this.currentSeriesFilter = 'all';
                this.currentMovieSearch = '';
                this.currentSeriesSearch = '';
                
                // Admin settings
                // 2. COLLEZ VOTRE ADMIN UID DE FIREBASE ICI (ENTRE LES GUILLEMETS)
                this.adminUID = 'XzbAaK0d1qc9AiJUdCGGzudIJXa2'; 
                this.isAdminLoggedIn = false; // Géré par Firebase Auth
                this.editingMovieId = null;
                this.editingSeriesId = null;
                
                // Data
                this.movies = [];
                this.series = [];
                
                // UI state
                this.currentView = 'home';
                this.newMovieToggleActive = false;
                this.newSeriesToggleActive = false;
                this.currentContent = null;
                this.firebaseConnected = false;
                this.seasonCount = 0;

                // Firebase services
                this.db = firebase.database();
                this.auth = firebase.auth(); // Ajout du service d'authentification

                this.init();
            }

            init() {
                this.initFirebase();
                this.bindEvents();
                this.showLoadingOverlay();
                
                // Show loading for 2 seconds to allow Firebase connection
                setTimeout(() => {
                    this.hideLoadingOverlay();
                    this.showHome();
                    this.initAnimations();
                }, 2000);

                this.initNavbarScroll();
            }

            initFirebase() {
                const connectionStatus = document.getElementById('connectionStatus');
                
                // Check connection status
                const connectedRef = this.db.ref('.info/connected');
                connectedRef.on('value', (snapshot) => {
                    if (snapshot.val() === true) {
                        this.firebaseConnected = true;
                        connectionStatus.className = 'connection-status connected';
                        connectionStatus.innerHTML = '<i class="fas fa-wifi"></i> Connected';
                        console.log('Connected to Firebase');
                        this.loadContentFromFirebase();
                    } else {
                        this.firebaseConnected = false;
                        connectionStatus.className = 'connection-status disconnected';
                        connectionStatus.innerHTML = '<i class="fas fa-wifi"></i> Disconnected';
                        console.log('Disconnected from Firebase');
                    }
                });

                // NOUVEL ÉCOUTEUR D'AUTHENTIFICATION
                // Gère l'état de connexion de l'admin
                this.auth.onAuthStateChanged((user) => {
                    // Vérifie si l'utilisateur est connecté ET si son UID est celui de l'admin
                    if (user && user.uid === this.adminUID) {
                        this.isAdminLoggedIn = true;
                        console.log('Admin is logged in');
                        // Si on est sur la page admin, montrer le panneau admin
                        if (this.currentView === 'admin') {
                            this.showAdminPanel();
                        }
                    } else {
                        this.isAdminLoggedIn = false;
                        console.log('User is logged out or not admin');
                        // Si on est sur la page admin, montrer le formulaire de login
                        if (this.currentView === 'admin') {
                            this.showAdminLogin();
                        }
                    }
                    // Mettre à jour l'UI pour montrer/cacher les boutons "edit/delete" partout
                    this.updateUI(); 
                });

                // Listen for movies changes in real-time
                this.db.ref('movies').on('value', (snapshot) => {
                    const data = snapshot.val();
                    if (data) {
                        this.movies = Object.keys(data).map(key => ({
                            id: key,
                            ...data[key]
                        }));
                    } else {
                        this.movies = [];
                    }
                    this.updateUI();
                });

                // Listen for series changes in real-time
                this.db.ref('series').on('value', (snapshot) => {
                    const data = snapshot.val();
                    if (data) {
                        this.series = Object.keys(data).map(key => ({
                            id: key,
                            ...data[key]
                        }));
                    } else {
                        this.series = [];
                    }
                    this.updateUI();
                });
            }

            loadContentFromFirebase() {
                // Check if we need to initialize sample data
                Promise.all([
                    this.db.ref('movies').once('value'),
                    this.db.ref('series').once('value')
                ]).then(([moviesSnapshot, seriesSnapshot]) => {
                    if (!moviesSnapshot.val()) {
                        this.initializeSampleMovies();
                    }
                    if (!seriesSnapshot.val()) {
                        this.initializeSampleSeries();
                    }
                });
            }

            initializeSampleMovies() {
                const sampleMovies = [
                    {
                        title: "The Shawshank Redemption",
                        year: 1994,
                        type: "Drama",
                        description: "Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.",
                        poster: "https://images.unsplash.com/photo-1489599732936-0a7c3fd5e8d1?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80",
                        videoUrl: "https://www.youtube.com/embed/6hB3S9bIaco"
                    },
                    {
                        title: "The Godfather",
                        year: 1972,
                        type: "Drama",
                        description: "The aging patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant son.",
                        poster: "https://images.unsplash.com/photo-1478720568477-152d9b164e26?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80",
                        videoUrl: "https://www.youtube.com/embed/sY1S34973zA"
                    }
                ];

                const moviesRef = this.db.ref('movies');
                sampleMovies.forEach(movie => {
                    moviesRef.push(movie);
                });
            }

            initializeSampleSeries() {
                const sampleSeries = [
                    {
                        title: "Stranger Things",
                        year: 2016,
                        type: "Sci-Fi",
                        description: "When a young boy disappears, his mother, a police chief and his friends must confront terrifying supernatural forces in order to get him back.",
                        poster: "https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80",
                        seasons: [
                            {
                                seasonNumber: 1,
                                episodes: [
                                    { episodeNumber: 1, title: "The Vanishing of Will Byers", videoUrl: "https://www.youtube.com/embed/b9EkMc79ZSU" },
                                    { episodeNumber: 2, title: "The Weirdo on Maple Street", videoUrl: "https://www.youtube.com/embed/XWxyRG_tckY" }
                                ]
                            }
                        ]
                    }
                ];

                const seriesRef = this.db.ref('series');
                sampleSeries.forEach(series => {
                    seriesRef.push(series);
                });
            }

            saveMovieToFirebase(movieData) {
                if (!this.firebaseConnected) {
                    alert('Not connected to Firebase. Please check your internet connection.');
                    return;
                }

                if (this.editingMovieId) {
                    // Update existing movie
                    this.db.ref('movies/' + this.editingMovieId).update(movieData)
                        .then(() => {
                            console.log('Movie updated successfully');
                        })
                        .catch((error) => {
                            console.error('Error updating movie:', error);
                            alert('Error updating movie: ' + error.message);
                        });
                } else {
                    // Add new movie
                    this.db.ref('movies').push(movieData)
                        .then(() => {
                            console.log('Movie added successfully');
                        })
                        .catch((error) => {
                            console.error('Error adding movie:', error);
                            alert('Error adding movie: ' + error.message);
                        });
                }
            }

            saveSeriestoFirebase(seriesData) {
                if (!this.firebaseConnected) {
                    alert('Not connected to Firebase. Please check your internet connection.');
                    return;
                }

                if (this.editingSeriesId) {
                    // Update existing series
                    this.db.ref('series/' + this.editingSeriesId).update(seriesData)
                        .then(() => {
                            console.log('Series updated successfully');
                        })
                        .catch((error) => {
                            console.error('Error updating series:', error);
                            alert('Error updating series: ' + error.message);
                        });
                } else {
                    // Add new series
                    this.db.ref('series').push(seriesData)
                        .then(() => {
                            console.log('Series added successfully');
                        })
                        .catch((error) => {
                            console.error('Error adding series:', error);
                            alert('Error adding series: ' + error.message);
                        });
                }
            }

            deleteMovieFromFirebase(movieId) {
                if (!this.firebaseConnected) {
                    alert('Not connected to Firebase. Please check your internet connection.');
                    return;
                }

                if (confirm('Are you sure you want to delete this movie? This action cannot be undone.')) {
                    this.db.ref('movies/' + movieId).remove()
                        .then(() => {
                            console.log('Movie deleted successfully');
                        })
                        .catch((error) => {
                            console.error('Error deleting movie:', error);
                            alert('Error deleting movie: ' + error.message);
                        });
                }
            }

            deleteSeriesFromFirebase(seriesId) {
                if (!this.firebaseConnected) {
                    alert('Not connected to Firebase. Please check your internet connection.');
                    return;
                }

                if (confirm('Are you sure you want to delete this series? This action cannot be undone.')) {
                    // CORRIGÉ : Suppression du '/' en trop qui causait la SyntaxError
                    this.db.ref('series/' + seriesId).remove()
                        .then(() => {
                            console.log('Series deleted successfully');
                        })
                        .catch((error) => {
                            console.error('Error deleting series:', error);
                            alert('Error deleting series: ' + error.message);
                        });
                }
            }

            updateUI() {
                this.renderContent();
                this.updateCollectionCounts();
                this.updateAdminStats();
            }

            bindEvents() {
                // Movie search input
                const movieSearchInput = document.getElementById('movieSearchInput');
                if (movieSearchInput) {
                    movieSearchInput.addEventListener('input', (e) => {
                        this.currentMovieSearch = e.target.value.toLowerCase();
                        this.currentPage = 1;
                        this.renderMovies();
                    });
                }

                // Series search input
                const seriesSearchInput = document.getElementById('seriesSearchInput');
                if (seriesSearchInput) {
                    seriesSearchInput.addEventListener('input', (e) => {
                        this.currentSeriesSearch = e.target.value.toLowerCase();
                        this.seriesCurrentPage = 1;
                        this.renderSeries();
                    });
                }

                // Close modal when clicking outside
                window.addEventListener('click', (e) => {
                    const modal = document.getElementById('videoModal');
                    if (e.target === modal) {
                        this.closeVideoModal();
                    }
                });

                // Escape key to close modal
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        this.closeVideoModal();
                    }
                });
            }

            initNavbarScroll() {
                const navbar = document.getElementById('mainNavbar');
                window.addEventListener('scroll', () => {
                    if (window.scrollY > 50) {
                        navbar.classList.add('scrolled');
                    } else {
                        navbar.classList.remove('scrolled');
                    }
                });
            }

            initAnimations() {
                const observerOptions = {
                    threshold: 0.1,
                    rootMargin: '0px 0px -50px 0px'
                };

                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            entry.target.classList.add('animate-slide-up');
                        }
                    });
                }, observerOptions);

                document.querySelectorAll('.content-card, .collection-card').forEach(el => {
                    observer.observe(el);
                });
            }

            showLoadingOverlay() {
                document.getElementById('loadingOverlay').classList.remove('hidden');
            }

            hideLoadingOverlay() {
                document.getElementById('loadingOverlay').classList.add('hidden');
            }

            showHome() {
                this.currentView = 'home';
                document.getElementById('mainContent').classList.remove('hidden');
                document.getElementById('moviesPage').classList.add('hidden');
                document.getElementById('seriesPage').classList.add('hidden');
                document.getElementById('adminSection').classList.add('hidden');
                this.renderNewContent();
                this.updateCollectionCounts();
            }

            showMovies() {
                this.currentView = 'movies';
                document.getElementById('mainContent').classList.add('hidden');
                document.getElementById('moviesPage').classList.remove('hidden');
                document.getElementById('seriesPage').classList.add('hidden');
                document.getElementById('adminSection').classList.add('hidden');
                this.renderMovies();
            }

            showSeries() {
                this.currentView = 'series';
                document.getElementById('mainContent').classList.add('hidden');
                document.getElementById('moviesPage').classList.add('hidden');
                document.getElementById('seriesPage').classList.remove('hidden');
                document.getElementById('adminSection').classList.add('hidden');
                this.renderSeries();
            }

            showCollections() {
                this.showHome();
                document.querySelector('#collectionsSection').scrollIntoView({ behavior: 'smooth' });
            }

            toggleAdmin() {
                this.currentView = 'admin';
                document.getElementById('mainContent').classList.add('hidden');
                document.getElementById('moviesPage').classList.add('hidden');
                document.getElementById('seriesPage').classList.add('hidden');
                document.getElementById('adminSection').classList.remove('hidden');
                
                if (this.isAdminLoggedIn) {
                    this.showAdminPanel();
                } else {
                    this.showAdminLogin();
                }
            }

            showAdminLogin() {
                document.getElementById('adminLogin').classList.remove('hidden');
                document.getElementById('adminPanel').classList.add('hidden');
            }

            showAdminPanel() {
                document.getElementById('adminLogin').classList.add('hidden');
                document.getElementById('adminPanel').classList.remove('hidden');
                this.renderAdminContent();
                this.updateAdminStats();
            }

            // MODIFIÉ : Fonction de login sécurisée
            adminLogin() {
                const email = document.getElementById('adminUsername').value;
                const password = document.getElementById('adminPassword').value;

                if (!email || !password) {
                    alert('Veuillez entrer un email et un mot de passe.');
                    return;
                }

                this.auth.signInWithEmailAndPassword(email, password)
                    .then((userCredential) => {
                        // Réussite ! onAuthStateChanged va s'occuper du reste.
                        console.log('Admin login successful', userCredential.user);
                        document.getElementById('adminUsername').value = '';
                        document.getElementById('adminPassword').value = '';
                    })
                    .catch((error) => {
                        console.error('Admin login error:', error);
                        alert('Erreur de connexion: ' + error.message);
                    });
            }

            // MODIFIÉ : Fonction de logout sécurisée
            adminLogout() {
                this.auth.signOut().then(() => {
                    // onAuthStateChanged va s'occuper du reste.
                    console.log('Admin logged out');
                }).catch((error) => {
                    console.error('Logout error:', error);
                    alert('Erreur de déconnexion: ' + error.message);
                });
            }

            // Movie Form Methods
            toggleNewMovieForm() {
                const form = document.getElementById('movieForm');
                const toggle = document.getElementById('newMovieToggle');
                
                // Hide series form if open
                if (this.newSeriesToggleActive) {
                    this.toggleNewSeriesForm();
                }
                
                if (this.newMovieToggleActive) {
                    form.classList.add('hidden');
                    toggle.innerHTML = '<i class="fas fa-plus"></i> Add New Movie';
                    toggle.classList.remove('active');
                    this.newMovieToggleActive = false;
                    this.cancelMovieEdit();
                } else {
                    form.classList.remove('hidden');
                    toggle.innerHTML = '<i class="fas fa-minus"></i> Cancel';
                    toggle.classList.add('active');
                    this.newMovieToggleActive = true;
                }
            }

            saveMovie(event) {
                event.preventDefault();
                
                const title = document.getElementById('movieTitle').value;
                const year = parseInt(document.getElementById('movieYear').value);
                const type = document.getElementById('movieType').value;
                const poster = document.getElementById('moviePoster').value;
                const videoUrl = document.getElementById('movieLink').value;
                const description = document.getElementById('movieDescription').value;

                const movieData = {
                    title,
                    year,
                    type,
                    poster,
                    videoUrl,
                    description
                };

                this.saveMovieToFirebase(movieData);
                this.resetMovieForm();
                this.toggleNewMovieForm();
            }

            editMovie(id) {
                const movie = this.movies.find(m => m.id === id);
                if (movie) {
                    this.editingMovieId = id;
                    document.getElementById('movieTitle').value = movie.title;
                    document.getElementById('movieYear').value = movie.year;
                    document.getElementById('movieType').value = movie.type;
                    document.getElementById('moviePoster').value = movie.poster;
                    document.getElementById('movieLink').value = movie.videoUrl;
                    document.getElementById('movieDescription').value = movie.description;
                    document.getElementById('movieFormTitle').textContent = 'Edit Movie';
                    
                    if (!this.newMovieToggleActive) {
                        this.toggleNewMovieForm();
                    }
                }
            }

            deleteMovie(id) {
                this.deleteMovieFromFirebase(id);
            }

            cancelMovieEdit() {
                this.editingMovieId = null;
                this.resetMovieForm();
                document.getElementById('movieFormTitle').textContent = 'Add New Movie';
            }

            resetMovieForm() {
                document.getElementById('movieTitle').value = '';
                document.getElementById('movieYear').value = '';
                document.getElementById('movieType').value = '';
                document.getElementById('moviePoster').value = '';
                document.getElementById('movieLink').value = '';
                document.getElementById('movieDescription').value = '';
            }

            // Series Form Methods
            toggleNewSeriesForm() {
                const form = document.getElementById('seriesForm');
                const toggle = document.getElementById('newSeriesToggle');
                
                // Hide movie form if open
                if (this.newMovieToggleActive) {
                    this.toggleNewMovieForm();
                }
                
                if (this.newSeriesToggleActive) {
                    form.classList.add('hidden');
                    toggle.innerHTML = '<i class="fas fa-plus"></i> Add New Series';
                    toggle.classList.remove('active');
                    this.newSeriesToggleActive = false;
                    this.cancelSeriesEdit();
                } else {
                    form.classList.remove('hidden');
                    toggle.innerHTML = '<i class="fas fa-minus"></i> Cancel';
                    toggle.classList.add('active');
                    this.newSeriesToggleActive = true;
                    this.addSeason(); // Add initial season
                }
            }

            addSeason() {
                this.seasonCount++;
                const container = document.getElementById('seasonsContainer');
                
                const seasonDiv = document.createElement('div');
                seasonDiv.className = 'seasons-container';
                seasonDiv.setAttribute('data-season', this.seasonCount);
                
                seasonDiv.innerHTML = `
                    <div class="season-header">
                        <div class="season-title">Season ${this.seasonCount}</div>
                        <button type="button" class="btn-remove" onclick="app.removeSeason(${this.seasonCount})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <div class="episodes-container" id="episodes-${this.seasonCount}">
                        <div class="episode-row">
                            <div class="form-group">
                                <label class="form-label">Episode 1</label>
                                <input type="text" class="form-input" placeholder="Episode title" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Video URL</label>
                                <input type="url" class="form-input" placeholder="https://..." required>
                            </div>
                            <div></div>
                            <button type="button" class="btn-add" onclick="app.addEpisode(${this.seasonCount})">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                    </div>
                `;
                
                container.appendChild(seasonDiv);
            }

            removeSeason(seasonNumber) {
                const seasonDiv = document.querySelector(`[data-season="${seasonNumber}"]`);
                if (seasonDiv) {
                    seasonDiv.remove();
                }
            }

            addEpisode(seasonNumber) {
                const container = document.getElementById(`episodes-${seasonNumber}`);
                const episodeCount = container.children.length + 1;
                
                const episodeDiv = document.createElement('div');
                episodeDiv.className = 'episode-row';
                
                episodeDiv.innerHTML = `
                    <div class="form-group">
                        <label class="form-label">Episode ${episodeCount}</label>
                        <input type="text" class="form-input" placeholder="Episode title" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Video URL</label>
                        <input type="url" class="form-input" placeholder="https://..." required>
                    </div>
                    <div></div>
                    <button type="button" class="btn-remove" onclick="this.parentElement.remove()">
                        <i class="fas fa-trash"></i>
                    </button>
                `;
                
                container.appendChild(episodeDiv);
            }

            saveSeries(event) {
                event.preventDefault();
                
                const title = document.getElementById('seriesTitle').value;
                const year = parseInt(document.getElementById('seriesYear').value);
                const type = document.getElementById('seriesType').value;
                const poster = document.getElementById('seriesPoster').value;
                const description = document.getElementById('seriesDescription').value;

                // Collect seasons and episodes data
                const seasons = [];
                const seasonContainers = document.querySelectorAll('.seasons-container');
                
                seasonContainers.forEach((seasonDiv, seasonIndex) => {
                    const episodeRows = seasonDiv.querySelectorAll('.episode-row');
                    const episodes = [];
                    
                    episodeRows.forEach((episodeRow, episodeIndex) => {
                        const inputs = episodeRow.querySelectorAll('.form-input');
                        if (inputs.length >= 2 && inputs[0].value.trim() && inputs[1].value.trim()) {
                            episodes.push({
                                episodeNumber: episodeIndex + 1,
                                title: inputs[0].value.trim(),
                                videoUrl: inputs[1].value.trim()
                            });
                        }
                    });
                    
                    if (episodes.length > 0) {
                        seasons.push({
                            seasonNumber: seasonIndex + 1,
                            episodes: episodes
                        });
                    }
                });

                if (seasons.length === 0) {
                    alert('Please add at least one season with episodes.');
                    return;
                }

                const seriesData = {
                    title,
                    year,
                    type,
                    poster,
                    description,
                    seasons
                };

                this.saveSeriestoFirebase(seriesData);
                this.resetSeriesForm();
                this.toggleNewSeriesForm();
            }

            editSeries(id) {
                const series = this.series.find(s => s.id === id);
                if (series) {
                    this.editingSeriesId = id;
                    document.getElementById('seriesTitle').value = series.title;
                    document.getElementById('seriesYear').value = series.year;
                    document.getElementById('seriesType').value = series.type;
                    document.getElementById('seriesPoster').value = series.poster;
                    document.getElementById('seriesDescription').value = series.description;
                    document.getElementById('seriesFormTitle').textContent = 'Edit Series';
                    
                    // Clear existing seasons
                    document.getElementById('seasonsContainer').innerHTML = '';
                    this.seasonCount = 0;
                    
                    // Add seasons from existing data
                    if (series.seasons) {
                        series.seasons.forEach((season, seasonIndex) => {
                            this.addSeason();
                            const episodesContainer = document.getElementById(`episodes-${this.seasonCount}`);
                            episodesContainer.innerHTML = '';
                            
                            season.episodes.forEach((episode, episodeIndex) => {
                                const episodeDiv = document.createElement('div');
                                episodeDiv.className = 'episode-row';
                                
                                episodeDiv.innerHTML = `
                                    <div class="form-group">
                                        <label class="form-label">Episode ${episodeIndex + 1}</label>
                                        <input type="text" class="form-input" placeholder="Episode title" value="${episode.title}" required>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Video URL</label>
                                        <input type="url" class="form-input" placeholder="https://..." value="${episode.videoUrl}" required>
                                    </div>
                                    <div></div>
                                    ${episodeIndex === 0 ? 
                                        `<button type="button" class="btn-add" onclick="app.addEpisode(${this.seasonCount})"><i class="fas fa-plus"></i></button>` :
                                        `<button type="button" class="btn-remove" onclick="this.parentElement.remove()"><i class="fas fa-trash"></i></button>`
                                    }
                                `;
                                
                                episodesContainer.appendChild(episodeDiv);
                            });
                        });
                    }
                    
                    if (!this.newSeriesToggleActive) {
                        this.toggleNewSeriesForm();
                    }
                }
            }

            deleteSeries(id) {
                this.deleteSeriesFromFirebase(id);
            }

            cancelSeriesEdit() {
                this.editingSeriesId = null;
                this.resetSeriesForm();
                document.getElementById('seriesFormTitle').textContent = 'Add New Series';
            }

            resetSeriesForm() {
                document.getElementById('seriesTitle').value = '';
                document.getElementById('seriesYear').value = '';
                document.getElementById('seriesType').value = '';
                document.getElementById('seriesPoster').value = '';
                document.getElementById('seriesDescription').value = '';
                document.getElementById('seasonsContainer').innerHTML = '';
                this.seasonCount = 0;
            }

            // Filter Methods
            filterMovies(filter) {
                this.currentMovieFilter = filter;
                this.currentPage = 1;
                
                // Update active filter button
                document.querySelectorAll('#movieFilters .filter-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                event.target.classList.add('active');
                
                this.renderMovies();
            }

            filterSeries(filter) {
                this.currentSeriesFilter = filter;
                this.seriesCurrentPage = 1;
                
                // Update active filter button
                document.querySelectorAll('#seriesFilters .filter-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                event.target.classList.add('active');
                
                this.renderSeries();
            }

            filterContent(filter, type) {
                if (type === 'movies') {
                    this.currentMovieFilter = filter;
                    this.showMovies();
                } else {
                    this.currentSeriesFilter = filter;
                    this.showSeries();
                }
            }

            getFilteredMovies() {
                let filtered = this.movies;

                // Apply search filter
                if (this.currentMovieSearch) {
                    filtered = filtered.filter(movie =>
                        movie.title.toLowerCase().includes(this.currentMovieSearch)
                    );
                }

                // Apply type filter
                if (this.currentMovieFilter !== 'all') {
                    filtered = filtered.filter(movie => movie.type === this.currentMovieFilter);
                }

                return filtered;
            }

            getFilteredSeries() {
                let filtered = this.series;

                // Apply search filter
                if (this.currentSeriesSearch) {
                    filtered = filtered.filter(series =>
                        series.title.toLowerCase().includes(this.currentSeriesSearch)
                    );
                }

                // Apply type filter
                if (this.currentSeriesFilter !== 'all') {
                    filtered = filtered.filter(series => series.type === this.currentSeriesFilter);
                }

                return filtered;
            }

            // Render Methods
            renderNewContent() {
                const container = document.getElementById('newContentGrid');
                const newMovies = this.movies
                    .sort((a, b) => b.year - a.year)
                    .slice(0, 3);
                const newSeries = this.series
                    .sort((a, b) => b.year - a.year)
                    .slice(0, 3);
                
                const newContent = [...newMovies, ...newSeries]
                    .sort((a, b) => b.year - a.year)
                    .slice(0, 6);

                container.innerHTML = newContent.map(content => this.createContentCard(content, false)).join('');
            }

            renderContent() {
                this.renderMovies();
                this.renderSeries();
                this.renderAdminContent();
                this.renderNewContent();
            }

            renderMovies() {
                const container = document.getElementById('moviesGrid');
                const filtered = this.getFilteredMovies();
                
                // Pagination
                const startIndex = (this.currentPage - 1) * this.moviesPerPage;
                const endIndex = startIndex + this.moviesPerPage;
                const paginatedMovies = filtered.slice(startIndex, endIndex);

                container.innerHTML = paginatedMovies.map(movie => 
                    this.createContentCard(movie, this.isAdminLoggedIn)
                ).join('');

                this.renderMoviePagination(filtered.length);
            }

            renderSeries() {
                const container = document.getElementById('seriesGrid');
                const filtered = this.getFilteredSeries();
                
                // Pagination
                const startIndex = (this.seriesCurrentPage - 1) * this.seriesPerPage;
                const endIndex = startIndex + this.seriesPerPage;
                const paginatedSeries = filtered.slice(startIndex, endIndex);

                container.innerHTML = paginatedSeries.map(series => 
                    this.createContentCard(series, this.isAdminLoggedIn)
                ).join('');

                this.renderSeriesPagination(filtered.length);
            }

            renderAdminContent() {
                if (!this.isAdminLoggedIn) return;
                
                const container = document.getElementById('adminContentGrid');
                const allContent = [
                    ...this.movies.map(m => ({ ...m, contentType: 'movie' })),
                    ...this.series.map(s => ({ ...s, contentType: 'series' }))
                ];
                
                container.innerHTML = allContent.map(content => 
                    this.createContentCard(content, true)
                ).join('');
            }

            createContentCard(content, showAdminControls) {
                const isSeries = content.seasons || content.contentType === 'series';
                const watchFunction = isSeries ? `app.watchSeries('${content.id}')` : `app.watchMovie('${content.id}')`;
                const editFunction = isSeries ? `app.editSeries('${content.id}')` : `app.editMovie('${content.id}')`;
                const deleteFunction = isSeries ? `app.deleteSeries('${content.id}')` : `app.deleteMovie('${content.id}')`;
                
                // Les contrôles admin ne s'affichent que si showAdminControls est vrai
                // ET this.isAdminLoggedIn est vrai (double sécurité)
                const showButtons = showAdminControls && this.isAdminLoggedIn;

                return `
                    <div class="content-card animate-scale-in">
                        ${isSeries ? '<div class="series-badge">Series</div>' : ''}
                        <img src="${content.poster}" alt="${content.title}" class="content-poster" loading="lazy">
                        <div class="content-info">
                            <div class="content-title">${content.title}</div>
                            <div class="content-meta">
                                <span>${content.year}</span>
                                <span>${content.type}</span>
                            </div>
                            <div class="content-description">${content.description}</div>
                            <div class="content-actions">
                                <button class="btn-watch" onclick="${watchFunction}">
                                    <i class="fas fa-play"></i> Watch
                                </button>
                                ${showButtons ? `
                                    <button class="btn-edit" onclick="${editFunction}" title="Edit">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn-delete" onclick="${deleteFunction}" title="Delete">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }

            renderMoviePagination(totalMovies) {
                const container = document.getElementById('moviePaginationContainer');
                const totalPages = Math.ceil(totalMovies / this.moviesPerPage);

                if (totalPages <= 1) {
                    container.innerHTML = '';
                    return;
                }

                let paginationHTML = `
                    <button class="pagination-btn" ${this.currentPage === 1 ? 'disabled' : ''} 
                            onclick="app.goToMoviePage(${this.currentPage - 1})">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                `;

                // Show page numbers
                for (let i = 1; i <= totalPages; i++) {
                    if (i === 1 || i === totalPages || (i >= this.currentPage - 2 && i <= this.currentPage + 2)) {
                        paginationHTML += `
                            <button class="pagination-btn ${i === this.currentPage ? 'active' : ''}" 
                                    onclick="app.goToMoviePage(${i})">
                                ${i}
                            </button>
                        `;
                    } else if (i === this.currentPage - 3 || i === this.currentPage + 3) {
                        paginationHTML += '<span class="pagination-btn" style="border: none; cursor: default;">...</span>';
                    }
                }

                paginationHTML += `
                    <button class="pagination-btn" ${this.currentPage === totalPages ? 'disabled' : ''} 
                            onclick="app.goToMoviePage(${this.currentPage + 1})">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                `;

                container.innerHTML = paginationHTML;
            }

            renderSeriesPagination(totalSeries) {
                const container = document.getElementById('seriesPaginationContainer');
                const totalPages = Math.ceil(totalSeries / this.seriesPerPage);

                if (totalPages <= 1) {
                    container.innerHTML = '';
                    return;
                }

                let paginationHTML = `
                    <button class="pagination-btn" ${this.seriesCurrentPage === 1 ? 'disabled' : ''} 
                            onclick="app.goToSeriesPage(${this.seriesCurrentPage - 1})">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                `;

                // Show page numbers
                for (let i = 1; i <= totalPages; i++) {
                    if (i === 1 || i === totalPages || (i >= this.seriesCurrentPage - 2 && i <= this.seriesCurrentPage + 2)) {
                        paginationHTML += `
                            <button class="pagination-btn ${i === this.seriesCurrentPage ? 'active' : ''}" 
                                    onclick="app.goToSeriesPage(${i})">
                                ${i}
                            </button>
                        `;
                    } else if (i === this.seriesCurrentPage - 3 || i === this.seriesCurrentPage + 3) {
                        paginationHTML += '<span class="pagination-btn" style="border: none; cursor: default;">...</span>';
                    }
                }

                paginationHTML += `
                    <button class="pagination-btn" ${this.seriesCurrentPage === totalPages ? 'disabled' : ''} 
                            onclick="app.goToSeriesPage(${this.seriesCurrentPage + 1})">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                `;

                container.innerHTML = paginationHTML;
            }

            goToMoviePage(page) {
                this.currentPage = page;
                this.renderMovies();
                window.scrollTo(0, 0);
            }

            goToSeriesPage(page) {
                this.seriesCurrentPage = page;
                this.renderSeries();
                window.scrollTo(0, 0);
            }

            updateCollectionCounts() {
                const movieCounts = {
                    drama: this.movies.filter(m => m.type === 'Drama').length,
                    action: this.movies.filter(m => m.type === 'Action').length,
                    comedy: this.movies.filter(m => m.type === 'Comedy').length,
                    thriller: this.movies.filter(m => m.type === 'Thriller').length
                };

                const seriesCounts = {
                    drama: this.series.filter(s => s.type === 'Drama').length,
                    action: this.series.filter(s => s.type === 'Action').length,
                    comedy: this.series.filter(s => s.type === 'Comedy').length,
                    thriller: this.series.filter(s => s.type === 'Thriller').length
                };

                const totalCounts = {
                    drama: movieCounts.drama + seriesCounts.drama,
                    action: movieCounts.action + seriesCounts.action,
                    comedy: movieCounts.comedy + seriesCounts.comedy,
                    thriller: movieCounts.thriller + seriesCounts.thriller
                };

                document.getElementById('dramaCount').textContent = `${totalCounts.drama} movies & series`;
                document.getElementById('actionCount').textContent = `${totalCounts.action} movies & series`;
                document.getElementById('comedyCount').textContent = `${totalCounts.comedy} movies & series`;
                document.getElementById('thrillerCount').textContent = `${totalCounts.thriller} movies & series`;
            }

            updateAdminStats() {
                if (!this.isAdminLoggedIn) return;

                const totalSeasons = this.series.reduce((sum, series) => {
                    return sum + (series.seasons ? series.seasons.length : 0);
                }, 0);

                const allGenres = new Set([
                    ...this.movies.map(m => m.type),
                    ...this.series.map(s => s.type)
                ]);

                document.getElementById('totalMovies').textContent = this.movies.length;
                document.getElementById('totalSeries').textContent = this.series.length;
                document.getElementById('totalSeasons').textContent = totalSeasons;
                document.getElementById('totalGenres').textContent = allGenres.size;
            }

            // Watch Content Methods
            watchMovie(id) {
                const movie = this.movies.find(m => m.id === id);
                if (movie) {
                    this.currentContent = movie;
                    document.getElementById('contentPlayer').src = movie.videoUrl;
                    document.getElementById('modalTitle').textContent = movie.title;
                    document.getElementById('modalYear').textContent = movie.year;
                    document.getElementById('modalType').textContent = movie.type;
                    document.getElementById('modalDescription').textContent = movie.description;
                    document.getElementById('episodeSelector').classList.add('hidden');
                    document.getElementById('videoModal').classList.add('show');
                    document.body.style.overflow = 'hidden';
                }
            }

            watchSeries(id) {
                const series = this.series.find(s => s.id === id);
                if (series) {
                    this.currentContent = series;
                    document.getElementById('contentPlayer').src = '';
                    document.getElementById('modalTitle').textContent = series.title;
                    document.getElementById('modalYear').textContent = series.year;
                    document.getElementById('modalType').textContent = series.type;
                    document.getElementById('modalDescription').textContent = series.description;
                    
                    // Setup season selector - FIXED: Using correct ID
                    const seasonSelector = document.getElementById('seasonSelect');
                    seasonSelector.innerHTML = '<option value="">Select Season</option>';
                    
                    if (series.seasons) {
                        series.seasons.forEach(season => {
                            const option = document.createElement('option');
                            option.value = season.seasonNumber;
                            option.textContent = `Season ${season.seasonNumber}`;
                            seasonSelector.appendChild(option);
                        });
                    }
                    
                    document.getElementById('episodeSelector').classList.remove('hidden');
                    document.getElementById('videoModal').classList.add('show');
                    document.body.style.overflow = 'hidden';
                }
            }

            updateEpisodeOptions() {
                // FIXED: Using correct IDs
                const seasonNumber = parseInt(document.getElementById('seasonSelect').value);
                const episodeSelector = document.getElementById('episodeSelect');
                
                episodeSelector.innerHTML = '<option value="">Select Episode</option>';
                
                if (this.currentContent && this.currentContent.seasons && seasonNumber) {
                    const season = this.currentContent.seasons.find(s => s.seasonNumber === seasonNumber);
                    if (season && season.episodes) {
                        season.episodes.forEach(episode => {
                            const option = document.createElement('option');
                            option.value = episode.episodeNumber;
                            option.textContent = `Episode ${episode.episodeNumber}: ${episode.title}`;
                            option.dataset.videoUrl = episode.videoUrl;
                            episodeSelector.appendChild(option);
                        });
                    }
                }
            }

            playSelectedEpisode() {
                // FIXED: Using correct IDs
                const seasonNumber = parseInt(document.getElementById('seasonSelect').value);
                const episodeNumber = parseInt(document.getElementById('episodeSelect').value);
                
                if (!seasonNumber || !episodeNumber) {
                    alert('Please select both season and episode.');
                    return;
                }
                
                if (this.currentContent && this.currentContent.seasons) {
                    const season = this.currentContent.seasons.find(s => s.seasonNumber === seasonNumber);
                    if (season && season.episodes) {
                        const episode = season.episodes.find(e => e.episodeNumber === episodeNumber);
                        if (episode) {
                            document.getElementById('contentPlayer').src = episode.videoUrl;
                        }
                    }
                }
            }

            closeVideoModal() {
                document.getElementById('videoModal').classList.remove('show');
                document.getElementById('contentPlayer').src = '';
                document.body.style.overflow = '';
                this.currentContent = null;
            }
        }

        // Initialize the app
        const app = new OussaStreamApp();

        // Hide connection status after 5 seconds if connected
        setTimeout(() => {
            const status = document.getElementById('connectionStatus');
            if (status.classList.contains('connected')) {
                status.style.opacity = '0';
                setTimeout(() => status.style.display = 'none', 300);
            }
        }, 5000);
    