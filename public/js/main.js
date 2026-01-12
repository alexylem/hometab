document.addEventListener('alpine:init', () => {

    const firebaseConfig = {
        apiKey: "AIzaSyCOHKUTbvJUieh0W68eeRZcxi9z79D_R0k",
        authDomain: "hometab-34d57.firebaseapp.com",
        projectId: "hometab-34d57",
        storageBucket: "hometab-34d57.firebasestorage.app",
        messagingSenderId: "465761212766",
        appId: "1:465761212766:web:65a33b25d81d9fc0d257cf"
    };

    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    const googleProvider = new firebase.auth.GoogleAuthProvider();

    // --- NEW: Environment Store ---
    Alpine.store('environmentStore', {
        environments: [],
        activeEnvironments: [],
        archivedEnvironments: [],
        currentEnv: null,
        loading: true,
        ENV_KEY: 'hometab-selected-env-id',

        async init(user) {
            if (!user) {
                this.environments = [];
                this.activeEnvironments = [];
                this.archivedEnvironments = [];
                this.currentEnv = null;
                this.loading = false;
                return;
            }
            this.loading = true;
            const envsRef = db.collection(`users/${user.uid}/environments`);
            const snapshot = await envsRef.get();

            if (snapshot.empty) {
                console.log("No environments found, starting one-time migration...");
                await this.migrateLegacyData(user);
            } else {
                this.environments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.activeEnvironments = this.environments.filter(env => !env.isArchived);
                this.archivedEnvironments = this.environments.filter(env => env.isArchived);
                this.loadSelectedEnvironment();
            }
            this.loading = false;
        },

        async migrateLegacyData(user) {
            const legacyCollections = ['todos', 'notes', 'links', 'shoppingList'];
            const newEnvRef = db.collection(`users/${user.uid}/environments`).doc();
            const batch = db.batch();

            batch.set(newEnvRef, { name: "Général", createdAt: firebase.firestore.FieldValue.serverTimestamp(), isArchived: false });

            for (const coll of legacyCollections) {
                try {
                    const legacyDataSnapshot = await db.collection(`users/${user.uid}/${coll}`).get();
                    if (!legacyDataSnapshot.empty) {
                        console.log(`Migrating ${legacyDataSnapshot.size} documents from '${coll}'...`);
                        legacyDataSnapshot.forEach(doc => {
                            const newDocRef = newEnvRef.collection(coll).doc(doc.id);
                            batch.set(newDocRef, doc.data());
                            batch.delete(doc.ref); // Delete old document
                        });
                    }
                } catch (e) {
                    console.warn(`Could not read legacy collection ${coll}, it might not exist.`, e);
                }
            }

            await batch.commit();
            console.log("Migration complete. Reloading environment list.");
            await this.init(user);
        },

        loadSelectedEnvironment() {
            const savedEnvId = localStorage.getItem(this.ENV_KEY);
            this.currentEnv = this.activeEnvironments.find(env => env.id === savedEnvId) || this.activeEnvironments[0];
            if (this.currentEnv) {
                localStorage.setItem(this.ENV_KEY, this.currentEnv.id);
            }
        },

        selectEnvironment(envId) {
            const newEnv = this.activeEnvironments.find(env => env.id === envId);
            if (newEnv && this.currentEnv && newEnv.id !== this.currentEnv.id) {
                this.currentEnv = newEnv;
                localStorage.setItem(this.ENV_KEY, this.currentEnv.id);
                location.reload(); 
            }
        },

        async createEnvironment(name) {
            const user = Alpine.store('authService').currentUser;
            if (!user || !name.trim()) return;
            const envsRef = db.collection(`users/${user.uid}/environments`);
            await envsRef.add({ name: name.trim(), createdAt: firebase.firestore.FieldValue.serverTimestamp(), isArchived: false });
            await this.init(user);
        },

        async renameEnvironment(envId, newName) {
            const user = Alpine.store('authService').currentUser;
            if (!user || !newName.trim()) return;
            await db.collection(`users/${user.uid}/environments`).doc(envId).update({ name: newName.trim() });
            await this.init(user);
        },

        async archiveEnvironment(envId) {
            const user = Alpine.store('authService').currentUser;
            if (!user || this.activeEnvironments.length <= 1) {
                alert("Vous ne pouvez pas archiver le dernier environnement actif.");
                return;
            }
            if (confirm("Voulez-vous vraiment archiver cet environnement ? Il sera masqué du sélecteur mais pourra être restauré plus tard.")) {
                await db.collection(`users/${user.uid}/environments`).doc(envId).update({ isArchived: true });
                if (this.currentEnv.id === envId) {
                    localStorage.removeItem(this.ENV_KEY);
                    location.reload();
                } else {
                    await this.init(user);
                }
            }
        },

        async unarchiveEnvironment(envId) {
            const user = Alpine.store('authService').currentUser;
            if (!user) return;
            await db.collection(`users/${user.uid}/environments`).doc(envId).update({ isArchived: false });
            await this.init(user);
        }
    });

    // --- Global Authentication Store ---
    Alpine.store('authService', {
        currentUser: null,
        loading: true,

        init() {
            auth.onAuthStateChanged(async (user) => {
                this.loading = true; 
                this.currentUser = user;
                if (user) {
                    console.log("User logged in:", user.displayName);
                    await Alpine.store('environmentStore').init(user);
                } else {
                    console.log("User logged out.");
                    await Alpine.store('environmentStore').init(null);
                }
                this.loading = false;
            });
        },

        async signInWithGoogle() {
            try {
                await auth.signInWithPopup(googleProvider);
            } catch (error) {
                console.error("Error signing in with Google:", error);
            }
        },

        async signOutUser() {
            try {
                await auth.signOut();
            } catch (error) {
                console.error("Error signing out:", error);
            }
        }
    });

    // Store global pour la modale des notes
    Alpine.store('notesModal', {
        isOpen: false,
        content: '',
        editingId: null,

        open(note = null) { 
            if (note) { 
                this.editingId = note.id;
                this.content = note.content;
            } else { 
                this.editingId = null;
                this.content = '';
            }
            this.isOpen = true;
        },

        close() {
            this.isOpen = false;
        }
    });

    Alpine.store('linksModal', {
        isOpen: false,
        title: '',
        url: '',
        faviconDataUrl: '',
        editingId: null,

        open(link = null) {
            this.editingId = link ? link.id : null;
            this.title = link ? link.title : '';
            this.url = link ? link.url : '';
            this.faviconDataUrl = (link && link.favicon && link.favicon.startsWith('data:image')) ? link.favicon : '';
            this.isOpen = true;
        },

        handleFaviconUpload(event) {
            if (!event.target.files || !event.target.files[0]) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                this.faviconDataUrl = e.target.result;
            };
            reader.readAsDataURL(event.target.files[0]);
        },

        close() {
            this.isOpen = false;
        },

        save() {
            const linkData = {
                id: this.editingId,
                title: this.title,
                url: this.url,
                favicon: this.faviconDataUrl
            };
            this.close();
            return linkData;
        }
    });

    // --- NEW: Environment Management Modal Store ---
    Alpine.store('envManagementModal', {
        isOpen: false,
        newEnvName: '',
        editingEnvId: null,
        editingEnvName: '',

        open() {
            this.isOpen = true;
            this.newEnvName = '';
            this.editingEnvId = null;
            this.editingEnvName = '';
        },
        close() {
            this.isOpen = false;
        },
        startRename(env) {
            this.editingEnvId = env.id;
            this.editingEnvName = env.name;
        },
        cancelRename() {
            this.editingEnvId = null;
            this.editingEnvName = '';
        }
    });

    // --- Helper for data components to interact with Firestore in current environment ---
    const createFirestoreCollectionComponent = (collectionName, orderByField = "createdAt", orderByDirection = "desc") => ({
        items: [],
        unsubscribe: null, 

        init() {
            this.$watch('$store.environmentStore.currentEnv', (newEnv) => {
                if (this.unsubscribe) {
                    this.unsubscribe();
                    this.items = [];
                }

                if (newEnv && Alpine.store('authService').currentUser) {
                    this.setupFirestoreListener(Alpine.store('authService').currentUser.uid, newEnv.id);
                }
            }, { immediate: true });
        },

        setupFirestoreListener(uid, envId) {
            const collectionRef = db.collection(`users/${uid}/environments/${envId}/${collectionName}`);
            const query = orderByField ? collectionRef.orderBy(orderByField, orderByDirection) : collectionRef;
            
            this.unsubscribe = query.onSnapshot((snapshot) => {
                this.items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }, (error) => {
                console.error(`Error fetching ${collectionName} for env ${envId}:`, error);
            });
        },
        
        getCollectionRef() {
            const uid = Alpine.store('authService').currentUser?.uid;
            const envId = Alpine.store('environmentStore').currentEnv?.id;
            if (!uid || !envId) {
                console.warn("User or Environment not set, cannot get collection reference.");
                return null;
            }
            return db.collection(`users/${uid}/environments/${envId}/${collectionName}`);
        }
    });

    // --- Main App & Widget Components ---

    Alpine.data('hometabApp', () => ({
        isExportModalOpen: false, isImportModalOpen: false, exportDataString: '', importDataString: '',
        updateAvailable: false,
        newWorker: null,

        init() {
            this.$store.authService.init();
            window.addEventListener('sw-update', (event) => {
                this.newWorker = event.detail;
                this.updateAvailable = true;
            });
        },

        installUpdate() {
            if (this.newWorker) {
                this.newWorker.postMessage({ action: 'skipWaiting' });
            }
        },

        openExportModal() {
            alert("L'exportation est en cours de développement pour la nouvelle structure d'environnements.");
        },
        openImportModal() {
            if (!this.$store.authService.currentUser || !this.$store.environmentStore.currentEnv) {
                alert("Veuillez vous connecter et sélectionner un environnement pour importer vos données.");
                return;
            }
            this.importDataString = '';
            this.isImportModalOpen = true;
        },
        async importFromText() {
            if (!this.$store.authService.currentUser || !this.$store.environmentStore.currentEnv) {
                alert("Veuillez vous connecter et sélectionner un environnement pour importer vos données.");
                return;
            }
            if (!this.importDataString.trim()) {
                alert("Veuillez coller la configuration.");
                return;
            }
            if (!confirm("Cette opération migrera les données de votre JSON vers votre environnement Firebase actuel. Les données existantes ne seront pas supprimées. Continuer ?")) {
                return;
            }

            const user = this.$store.authService.currentUser;
            const currentEnvId = this.$store.environmentStore.currentEnv.id;
            const batch = db.batch();

            try {
                const data = JSON.parse(this.importDataString);
                let itemsImported = 0;

                for (const [key, value] of Object.entries(data)) {
                    let collectionName = null;
                    if (key.startsWith('hometabTodos') || key.startsWith('hometab-todos')) collectionName = 'todos';
                    else if (key.startsWith('hometabNotes') || key.startsWith('hometab-notes')) collectionName = 'notes';
                    else if (key.startsWith('hometabShoppingList') || key.startsWith('hometab-shopping-list')) collectionName = 'shoppingList';
                    else if (key.startsWith('hometabLinks') || key.startsWith('hometab-links')) collectionName = 'links';
                    
                    if (collectionName) {
                        try {
                            const items = JSON.parse(value);
                            if (Array.isArray(items)) {
                                const collectionRef = db.collection(`users/${user.uid}/environments/${currentEnvId}/${collectionName}`);
                                items.forEach(item => {
                                    const { id, ...itemData } = item;
                                    if (!itemData.createdAt) {
                                        itemData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                                    } else if (typeof itemData.createdAt === 'object' && itemData.createdAt.seconds) {
                                        itemData.createdAt = new firebase.firestore.Timestamp(itemData.createdAt.seconds, itemData.createdAt.nanoseconds);
                                    }
                                    const newDocRef = collectionRef.doc();
                                    batch.set(newDocRef, itemData);
                                    itemsImported++;
                                });
                            }
                        } catch (e) {
                            console.warn(`Impossible de parser la valeur pour la clé ${key}, elle est ignorée.`);
                        }
                    }
                }

                if (itemsImported === 0) {
                    alert("Aucune donnée pertinente (tâches, notes, etc.) n'a été trouvée dans le JSON importé.");
                    return;
                }

                await batch.commit();
                alert(`Importation réussie ! ${itemsImported} éléments ont été ajoutés à votre environnement actuel. La page va se recharger.`);
                location.reload();

            } catch (e) {
                alert("Erreur lors de l'importation. Le format du JSON est peut-être invalide.");
                console.error("Import Error:", e);
            }
        }
    }));

    Alpine.data('linksApp', () => ({
        ...createFirestoreCollectionComponent('links', 'createdAt', 'asc'),
        
        async processSaveEvent(detail) {
            const collectionRef = this.getCollectionRef();
            if (!collectionRef) return;
            const { id, title, url, favicon } = detail;
            if (!title.trim() || !url.trim()) return;
            let formattedUrl = url.trim();
            if (!formattedUrl.startsWith('http')) formattedUrl = 'https://' + formattedUrl;
            try {
                if (id) await collectionRef.doc(id).update({ title, url: formattedUrl, favicon });
                else await collectionRef.add({ title, url: formattedUrl, favicon, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            } catch (e) { console.error("Error saving link:", e); }
        },
        async removeLink(id) {
            const collectionRef = this.getCollectionRef();
            if (!collectionRef) return;
            if (confirm('Supprimer ce lien ?')) {
                try { await collectionRef.doc(id).delete(); } catch (e) { console.error("Error removing link:", e); }
            }
        },
        openAddLinkModal() { Alpine.store('linksModal').open(); },
        openEditLinkModal(link) { Alpine.store('linksModal').open(link); }
    }));

    Alpine.data('notesApp', () => ({
        ...createFirestoreCollectionComponent('notes'),
        getNoteTitle(content) { return content ? (content.trim().split('\n')[0] || 'Note sans titre') : 'Note sans titre'; },
        openNewNoteModal() { Alpine.store('notesModal').open(); },
        openEditNoteModal(note) { Alpine.store('notesModal').open(note); },
        async processSaveEvent(detail) {
            const collectionRef = this.getCollectionRef();
            if (!collectionRef) return;
            const { editingId, content } = detail;
            if (!content || !content.trim()) return;
            try {
                if (editingId) await collectionRef.doc(editingId).update({ content });
                else await collectionRef.add({ content, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            } catch (e) { console.error("Error saving note:", e); }
        },
        async removeNote(id) {
            const collectionRef = this.getCollectionRef();
            if (!collectionRef) return;
            if (confirm('Supprimer cette note ?')) {
                try { await collectionRef.doc(id).delete(); } catch (e) { console.error("Error removing note:", e); }
            }
        }
    }));

    Alpine.data('todoApp', () => ({
        ...createFirestoreCollectionComponent('todos'),
        newTodo: '', selectedPeople: [], editingTodoId: null,
        
        setupFirestoreListener(uid, envId) {
            const collectionRef = db.collection(`users/${uid}/environments/${envId}/todos`);
            const query = collectionRef.orderBy("createdAt", "desc");
            
            this.unsubscribe = query.onSnapshot((snapshot) => {
                this.items = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return { 
                        id: doc.id, 
                        ...data,
                        following: data.following || false // Assurer la compatibilité ascendante
                    };
                });
            }, (error) => {
                console.error(`Error fetching todos for env ${envId}:`, error);
            });
        },

        get allPeople() { const c = this.items.filter(t => !t.completed && !t.following).flatMap(t => t.people || []).reduce((acc, n) => { acc[n] = (acc[n] || 0) + 1; return acc; }, {}); return Object.entries(c).map(([n, cnt]) => ({ name: n, count: cnt })).sort((a, b) => b.count - a.count); },
        get baseFilteredTodos() { if (this.selectedPeople.length === 0) return this.items; return this.items.filter(t => this.selectedPeople.every(p => (t.people || []).includes(p))); },
        get todayTodos() { return this.baseFilteredTodos.filter(t => !t.completed && !t.following && t.isToday); },
        get laterTodos() { return this.baseFilteredTodos.filter(t => !t.completed && !t.following && !t.isToday); },
        get followingTodos() { return this.baseFilteredTodos.filter(t => t.following); },
        get completedTodos() { return this.baseFilteredTodos.filter(t => t.completed).sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)); },
        
        capitalize(s) { if (!s) return ''; return s.charAt(0).toUpperCase() + s.slice(1); },
        highlightMentions(t) { if (!t) return ''; return t.replace(/@(\p{L}[\p{L}\p{N}_-]*)/gu, (m, p1) => `<span class="text-blue-600 font-semibold">@${this.capitalize(p1)}</span>`); },
        
        async addTodo() {
            const collectionRef = this.getCollectionRef();
            if (!collectionRef) return;
            let txt = this.newTodo.trim();
            if (txt === '') return;
            let isToday = txt.endsWith('!');
            if (isToday) txt = txt.slice(0, -1).trim();
            const mentions = [...txt.matchAll(/@(\p{L}[\p{L}\p{N}_-]*)/gu)].map(m => m[1].toLowerCase());
            try {
                await collectionRef.add({ text: txt, completed: false, following: false, isToday, people: [...new Set(mentions)], createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                this.newTodo = '';
            } catch (e) { console.error("Error adding todo:", e); }
        },
        
        async updateTodo() {
            const collectionRef = this.getCollectionRef();
            if (!collectionRef || !this.editingTodoId) return;
            let text = this.newTodo.trim();
            let isToday = text.endsWith('!');
            if (isToday) text = text.slice(0, -1).trim();
            const mentions = [...text.matchAll(/@(\p{L}[\p{L}\p{N}_-]*)/gu)].map(m => m[1].toLowerCase());
            try {
                await collectionRef.doc(this.editingTodoId).update({ text, isToday, people: [...new Set(mentions)] });
                this.cancelEditingTodo();
            } catch (e) { console.error("Error updating todo:", e); }
        },

        startEditingTodo(todo) { this.editingTodoId = todo.id; this.newTodo = todo.text + (todo.isToday ? ' !' : ''); this.$nextTick(() => { const i = this.$el.querySelector('input[type="text"]'); if (i) i.focus(); }); },
        cancelEditingTodo() { this.editingTodoId = null; this.newTodo = ''; },
        
        async removeTodo(id) {
            const collectionRef = this.getCollectionRef();
            if (!collectionRef) return;

            const todo = this.items.find(t => t.id === id);
            if (!todo) return;

            const deleteTodo = async () => {
                try {
                    await collectionRef.doc(id).delete();
                } catch (e) {
                    console.error(e);
                }
            };

            if (todo.completed) {
                await deleteTodo();
            } else {
                if (confirm('Supprimer cette tâche ?')) {
                    await deleteTodo();
                }
            }
        },

        async moveToToday(id) { const ref = this.getCollectionRef(); if (ref) await ref.doc(id).update({ isToday: true }); },
        async moveToLater(id) { const ref = this.getCollectionRef(); if (ref) await ref.doc(id).update({ isToday: false }); },
        
        async clearCompletedTasks() {
            const collectionRef = this.getCollectionRef();
            if (!collectionRef) return;
            if (confirm("Vraiment supprimer toutes les tâches terminées ?")) {
                try {
                    const q = collectionRef.where("completed", "==", true);
                    const snap = await q.get();
                    const batch = db.batch();
                    snap.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                } catch (e) { console.error("Error clearing completed tasks:", e); }
            }
        },

        toggleFilterPerson(p) { const i = this.selectedPeople.indexOf(p); if (i === -1) this.selectedPeople.push(p); else this.selectedPeople.splice(i, 1); },
        
        async toggleCompleted(todoId) {
            const collectionRef = this.getCollectionRef();
            if (!collectionRef) return;
            const todo = this.items.find(t => t.id === todoId);
            if (todo) {
                const newCompleted = !todo.completed;
                const newFollowing = newCompleted ? false : todo.following;
                await collectionRef.doc(todoId).update({ completed: newCompleted, following: newFollowing });
            }
        },
        
        async toggleFollowing(todoId) {
            const collectionRef = this.getCollectionRef();
            if (!collectionRef) return;
            const todo = this.items.find(t => t.id === todoId);
            if (todo) {
                const newFollowing = !todo.following;
                const newCompleted = newFollowing ? false : todo.completed;
                await collectionRef.doc(todoId).update({ following: newFollowing, completed: newCompleted });
            }
        },
    }));

    Alpine.data('shoppingListApp', () => ({
        ...createFirestoreCollectionComponent('shoppingList'),
        newItem: '', editingItemId: null,
        get activeItems() { return this.items.filter(item => !item.completed); },
        get completedItems() { return this.items.filter(item => item.completed).sort((a,b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)); },
        async addItem() {
            const collectionRef = this.getCollectionRef();
            if (!collectionRef) return;
            if (this.newItem.trim() === '') return;
            try {
                await collectionRef.add({ text: this.newItem.trim(), completed: false, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                this.newItem = '';
            } catch (e) { console.error("Error adding item:", e); }
        },
        async removeItem(id) {
            const collectionRef = this.getCollectionRef();
            if (!collectionRef) return;
            try { await collectionRef.doc(id).delete(); } catch (e) { console.error(e); }
        },
        async toggleCompletion(id) {
            const collectionRef = this.getCollectionRef();
            if (!collectionRef) return;
            const item = this.items.find(i => i.id === id);
            if (item) await collectionRef.doc(id).update({ completed: !item.completed });
        },
        async clearCompletedItems() {
            const collectionRef = this.getCollectionRef();
            if (!collectionRef) return;
            if (confirm("Vraiment effacer les articles achetés ?")) {
                try {
                    const q = collectionRef.where("completed", "==", true);
                    const snap = await q.get();
                    const batch = db.batch();
                    snap.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                } catch (e) { console.error("Error clearing completed items:", e); }
            }
        },
        startEditing(item) { this.editingItemId = item.id; this.newItem = item.text; this.$nextTick(() => { const i = this.$el.querySelector('input[type="text"]'); if (i) i.focus(); }); },
        async updateItem() {
            const collectionRef = this.getCollectionRef();
            if (!collectionRef || !this.editingItemId) return;
            if (this.newItem.trim() === '') {
                await this.removeItem(this.editingItemId);
            } else {
                try { await collectionRef.doc(this.editingItemId).update({ text: this.newItem.trim() }); } catch(e) { console.error(e); }
            }
            this.cancelEditing();
        },
        cancelEditing() { this.editingItemId = null; this.newItem = ''; }
    }));
});
