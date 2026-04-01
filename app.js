const StorageManager = {
    KEY: 'fintrack_v3_data',
    BUDGET_KEY: 'fintrack_v3_budgets',
    LAST_SYNC_KEY: 'fintrack_v3_last_sync',
    THEME_KEY: 'fintrack_v3_theme',
    
    save(data) {
        try {
            localStorage.setItem(this.KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('Main data save failed. Attempting cleanup...', e);
            this.handleStorageFull();
            try {
                localStorage.setItem(this.KEY, JSON.stringify(data));
            } catch (retryError) {
                console.error('Main data save failed after cleanup!', retryError);
                alert("Gagal menyimpan data! Penyimpanan browser penuh. Silakan ekspor data Anda dan hapus beberapa transaksi atau backup lama.");
                return;
            }
        }
        
        if (window.requestIdleCallback) {
            requestIdleCallback(() => this.autoBackup());
        } else {
            this.autoBackup();
        }
    },
    load() {
        return JSON.parse(localStorage.getItem(this.KEY)) || [];
    },
    saveBudgets(budgets) {
        localStorage.setItem(this.BUDGET_KEY, JSON.stringify(budgets));
    },
    loadBudgets() {
        return JSON.parse(localStorage.getItem(this.BUDGET_KEY)) || {};
    },
    saveLastSync(date) {
        localStorage.setItem(this.LAST_SYNC_KEY, date);
    },
    getLastSync() {
        return localStorage.getItem(this.LAST_SYNC_KEY);
    },
    saveTheme(theme) {
        localStorage.setItem(this.THEME_KEY, theme);
    },
    getTheme() {
        return localStorage.getItem(this.THEME_KEY) || 'light';
    },
    autoBackup() {
        const lastBackup = localStorage.getItem('fintrack_last_backup');
        const now = Date.now();
        if (!lastBackup || now - lastBackup > 7 * 24 * 60 * 60 * 1000) {
            const data = {
                transactions: this.load(),
                budgets: this.loadBudgets(),
                date: new Date().toISOString()
            };
            const trySave = () => {
                try {
                    const backupKey = 'fintrack_backup_' + new Date().toISOString().split('T')[0];
                    localStorage.setItem(backupKey, JSON.stringify(data));
                    localStorage.setItem('fintrack_last_backup', now);
                    this.cleanOldBackups();
                    return true;
                } catch(e) {
                    return false;
                }
            };

            if (!trySave()) {
                console.warn('First backup attempt failed. Cleaning up...');
                this.handleStorageFull();
                if (!trySave()) {
                    console.error('Backup failed after cleanup!');
                    alert("Peringatan: Penyimpanan browser hampir penuh. Gagal membuat backup otomatis. Silakan ekspor data Anda secara manual.");
                }
            }
        }
    },
    handleStorageFull() {
        // More aggressive cleanup: delete oldest 5 backups
        const backups = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('fintrack_backup_')) backups.push(key);
        }
        if (backups.length > 0) {
            backups.sort().slice(0, 5).forEach(key => localStorage.removeItem(key));
            console.log('Aggressive cleanup: Deleted 5 oldest backups.');
        }
    },
    cleanOldBackups() {
        const backups = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('fintrack_backup_')) backups.push(key);
        }
        // Limit to max 10 backups, delete oldest
        if (backups.length > 10) {
            backups.sort().slice(0, backups.length - 10).forEach(key => localStorage.removeItem(key));
        }
    }
};

const TransactionManager = {
    transactions: StorageManager.load(),
    budgets: StorageManager.loadBudgets(),
    
    add(transaction) {
        transaction.id = transaction.id || Date.now() + Math.random().toString(36).substr(2, 9);
        this.transactions.unshift(transaction);
        this.save();
        this.checkBudgetNotifications(transaction.category);
    },
    
    update(id, updatedData) {
        const index = this.transactions.findIndex(t => t.id === id);
        if (index !== -1) {
            this.transactions[index] = { ...this.transactions[index], ...updatedData };
            this.save();
            this.checkBudgetNotifications(updatedData.category);
        }
    },
    
    delete(id) {
        const t = this.transactions.find(t => t.id === id);
        this.transactions = this.transactions.filter(t => t.id !== id);
        this.save();
        if (t) this.checkBudgetNotifications(t.category);
    },

    deleteAll() {
        this.transactions = [];
        this.save();
    },
    
    save() {
        StorageManager.save(this.transactions);
    },

    setBudget(category, amount) {
        this.budgets[category] = amount;
        StorageManager.saveBudgets(this.budgets);
        this.checkBudgetNotifications(category);
    },

    checkBudgetNotifications(category) {
        if (!("Notification" in window) || Notification.permission !== "granted") return;
        
        const budget = this.budgets[category];
        if (!budget) return;

        const currentMonth = new Date().toISOString().substring(0, 7);
        const spent = this.transactions
            .filter(t => t.type === 'expense' && t.date.startsWith(currentMonth) && t.category === category)
            .reduce((acc, t) => acc + t.amount, 0);

        const ratio = spent / budget;
        if (ratio >= 1) {
            new Notification("FinTrack: Anggaran Terlampaui!", {
                body: `Pengeluaran ${category} sudah melebihi anggaran Rp ${budget.toLocaleString('id-ID')}`,
                icon: "icons/icon-192x192.png"
            });
        } else if (ratio >= 0.8) {
            new Notification("FinTrack: Peringatan Anggaran!", {
                body: `Pengeluaran ${category} telah mencapai 80% dari anggaran.`,
                icon: "icons/icon-192x192.png"
            });
        }
    },

    syncRecurring() {
        const lastSync = StorageManager.getLastSync();
        const today = new Date();
        const currentDateStr = today.toISOString().split('T')[0];

        if (lastSync === currentDateStr) return;

        const recurringTransactions = this.transactions.filter(t => t.recurring);
        let added = false;

        recurringTransactions.forEach(t => {
            const lastOccurrence = this.transactions
                .filter(tr => tr.desc === t.desc && tr.amount === t.amount && tr.category === t.category)
                .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            
            if (!lastOccurrence) return;

            const lastDate = new Date(lastOccurrence.date);
            const period = t.recurringPeriod || 'monthly';
            let nextDate = new Date(lastDate);

            if (period === 'weekly') {
                nextDate.setDate(lastDate.getDate() + 7);
            } else if (period === 'monthly') {
                // Safer addMonth: ensure it doesn't skip if target month is shorter
                const currentDay = lastDate.getDate();
                nextDate.setMonth(lastDate.getMonth() + 1, 1); // Go to 1st of next month
                const lastDayOfNextMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
                nextDate.setDate(Math.min(currentDay, lastDayOfNextMonth));
            } else if (period === 'yearly') {
                nextDate.setFullYear(lastDate.getFullYear() + 1);
            }

            if (nextDate <= today) {
                this.add({ ...t, id: null, date: nextDate.toISOString().split('T')[0] });
                added = true;
            }
        });

        if (added) StorageManager.saveLastSync(currentDateStr);
    },
    
    getSummary(filteredTransactions = null) {
        const data = filteredTransactions || this.transactions;
        return data.reduce((acc, t) => {
            if (t.type === 'income') acc.income += t.amount;
            else acc.expense += t.amount;
            acc.balance = acc.income - acc.expense;
            return acc;
        }, { income: 0, expense: 0, balance: 0 });
    },

    getBudgetStatus() {
        const currentMonth = new Date().toISOString().substring(0, 7);
        const monthlyExpenses = this.transactions
            .filter(t => t.type === 'expense' && t.date.startsWith(currentMonth))
            .reduce((acc, t) => {
                acc[t.category] = (acc[t.category] || 0) + t.amount;
                return acc;
            }, {});

        return Object.keys(this.budgets).map(cat => ({
            category: cat,
            budget: this.budgets[cat],
            spent: monthlyExpenses[cat] || 0
        })).filter(b => b.spent > b.budget * 0.8);
    },

    getTopExpenses() {
        const currentMonth = new Date().toISOString().substring(0, 7);
        return this.transactions
            .filter(t => t.type === 'expense' && t.date.startsWith(currentMonth))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5);
    }
};

const ChartManager = {
    catChart: null,
    trendChart: null,
    
    updateCharts(transactions) {
        this.updateCategoryChart(transactions);
        this.updateTrendChart(transactions);
    },

    updateCategoryChart(transactions) {
        const canvas = document.getElementById('categoryChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const expenses = transactions.filter(t => t.type === 'expense');
        const incomes = transactions.filter(t => t.type === 'income');
        const noDataEl = document.getElementById('no-category-data');
        
        if (expenses.length === 0 && incomes.length === 0) {
            if (this.catChart) this.catChart.destroy();
            noDataEl.classList.remove('hidden');
            return;
        }
        
        noDataEl.classList.add('hidden');
        
        // Optimization: Group small categories into "Lainnya" if too many
        const limit = 8;
        const processData = (map) => {
            const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
            if (sorted.length <= limit) return map;
            
            const result = Object.fromEntries(sorted.slice(0, limit - 1));
            const othersValue = sorted.slice(limit - 1).reduce((acc, curr) => acc + curr[1], 0);
            result['Lainnya'] = (result['Lainnya'] || 0) + othersValue;
            return result;
        };

        const expenseMap = processData(expenses.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + t.amount; return acc; }, {}));
        const incomeMap = processData(incomes.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + t.amount; return acc; }, {}));
        
        const labels = Array.from(new Set([...Object.keys(expenseMap), ...Object.keys(incomeMap)]));

        if (this.catChart) this.catChart.destroy();
        this.catChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Pengeluaran', data: labels.map(l => expenseMap[l] || 0), backgroundColor: '#ef4444', borderRadius: 5 },
                    { label: 'Pemasukan', data: labels.map(l => incomeMap[l] || 0), backgroundColor: '#10b981', borderRadius: 5 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: UIController.isDark ? '#cbd5e1' : '#64748b' } } },
                scales: { 
                    y: { beginAtZero: true, ticks: { color: UIController.isDark ? '#94a3b8' : '#64748b' }, grid: { color: UIController.isDark ? '#334155' : '#f1f5f9' } },
                    x: { ticks: { color: UIController.isDark ? '#94a3b8' : '#64748b' }, grid: { display: false } }
                }
            }
        });
    },

    updateTrendChart(transactions) {
        const canvas = document.getElementById('trendChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        if (transactions.length === 0) {
            if (this.trendChart) this.trendChart.destroy();
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.fillStyle = "#94a3b8";
            ctx.textAlign = "center";
            ctx.font = "italic 14px Inter";
            ctx.fillText("Tidak ada data tren saldo", ctx.canvas.width / 2, ctx.canvas.height / 2);
            return;
        }

        let dates = Array.from(new Set(transactions.map(t => t.date))).sort();
        if (dates.length > 30) dates = dates.slice(-30);
        
        const dailyBalances = dates.map(date => {
            return TransactionManager.transactions.filter(t => t.date <= date).reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), 0);
        });

        if (this.trendChart) this.trendChart.destroy();
        this.trendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates.map(d => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })),
                datasets: [{ label: 'Saldo', data: dailyBalances, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.4, pointRadius: dates.length > 15 ? 0 : 3 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { 
                    y: { grid: { color: UIController.isDark ? '#334155' : '#f1f5f9' }, ticks: { color: UIController.isDark ? '#94a3b8' : '#64748b' } },
                    x: { ticks: { color: UIController.isDark ? '#94a3b8' : '#64748b' }, grid: { display: false } }
                }
            }
        });
    }
};

const UIController = {
    // DOM Caching
    elements: {
        totalIncome: document.getElementById('total-income'),
        totalExpense: document.getElementById('total-expense'),
        totalBalance: document.getElementById('total-balance'),
        transactionList: document.getElementById('transaction-list'),
        searchInput: document.getElementById('search-input'),
        filterCategory: document.getElementById('filter-category'),
        filterType: document.getElementById('filter-type'),
        filterStartDate: document.getElementById('filter-start-date'),
        filterEndDate: document.getElementById('filter-end-date'),
        filterPreset: document.getElementById('filter-preset'),
        sortDate: document.getElementById('sort-date'),
        prevPage: document.getElementById('prev-page'),
        nextPage: document.getElementById('next-page'),
        paginationInfo: document.getElementById('pagination-info'),
        topExpensesList: document.getElementById('top-expenses-list'),
        budgetAlerts: document.getElementById('budget-alerts'),
        budgetSection: document.getElementById('budget-section'),
        loader: document.getElementById('loader'),
        transactionForm: document.getElementById('transaction-form')
    },

    currentPage: 1, itemsPerPage: 10, sortOrder: 'desc', searchQuery: '', filterType: 'all', filterCategory: 'all', startDate: '', endDate: '', deleteId: null, isDark: false, deferredPrompt: null, pendingAction: null,

    init() {
        this.loadTheme();
        this.setupEventListeners();
        this.setDefaultDate();
        this.requestNotificationPermission();
        TransactionManager.syncRecurring();
        this.updateUI();
        this.hideLoader();
        this.checkPWA();
    },

    loadTheme() {
        const theme = StorageManager.getTheme();
        this.isDark = theme === 'dark';
        if (this.isDark) document.documentElement.classList.add('dark');
        this.updateThemeIcon();
    },

    updateThemeIcon() {
        const icon = document.querySelector('#dark-mode-toggle i');
        if (icon) icon.className = this.isDark ? 'fas fa-sun' : 'fas fa-moon';
    },

    toggleTheme() {
        this.isDark = !this.isDark;
        document.documentElement.classList.toggle('dark');
        StorageManager.saveTheme(this.isDark ? 'dark' : 'light');
        this.updateThemeIcon();
        this.updateUI();
    },

    checkPWA() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            const btn = document.getElementById('install-pwa');
            if (btn) btn.classList.remove('hidden');
        });
        document.getElementById('install-pwa')?.addEventListener('click', async () => {
            if (this.deferredPrompt) {
                this.deferredPrompt.prompt();
                const { outcome } = await this.deferredPrompt.userChoice;
                if (outcome === 'accepted') document.getElementById('install-pwa').classList.add('hidden');
                this.deferredPrompt = null;
            }
        });
    },

    requestNotificationPermission() {
        if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    },

    setupEventListeners() {
        // Mobile Menu
        document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
            alert("Gunakan menu Dashboard atau Transaksi untuk navigasi.");
        });

        document.getElementById('dark-mode-toggle').addEventListener('click', () => this.toggleTheme());
        this.elements.transactionForm.addEventListener('submit', (e) => this.handleFormSubmit(e));
        document.getElementById('recurring').addEventListener('change', (e) => {
            document.getElementById('recurring-options').classList.toggle('hidden', !e.target.checked);
        });
        
        this.elements.searchInput.addEventListener('input', (e) => { this.searchQuery = e.target.value.toLowerCase(); this.currentPage = 1; this.updateUI(); });
        this.elements.filterCategory.addEventListener('change', (e) => { this.filterCategory = e.target.value; this.currentPage = 1; this.updateUI(); });
        this.elements.filterType.addEventListener('change', (e) => { this.filterType = e.target.value; this.currentPage = 1; this.updateUI(); });
        
        this.elements.filterStartDate.addEventListener('change', (e) => { this.startDate = e.target.value; this.validateDateRange(); this.updateUI(); });
        this.elements.filterEndDate.addEventListener('change', (e) => { this.endDate = e.target.value; this.validateDateRange(); this.updateUI(); });
        this.elements.filterPreset.addEventListener('change', (e) => { this.applyPreset(e.target.value); this.updateUI(); });
        this.elements.sortDate.addEventListener('click', () => { this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc'; this.updateUI(); });
        
        this.elements.prevPage.addEventListener('click', () => { if (this.currentPage > 1) { this.currentPage--; this.updateUI(); } });
        this.elements.nextPage.addEventListener('click', () => { this.currentPage++; this.updateUI(); });
        
        // Event Delegation for Table Actions
        this.elements.transactionList.addEventListener('click', (e) => {
            const editBtn = e.target.closest('button[data-action="edit"]');
            const deleteBtn = e.target.closest('button[data-action="delete"]');
            
            if (editBtn) {
                const id = editBtn.getAttribute('data-id');
                this.editTransaction(id);
            } else if (deleteBtn) {
                const id = deleteBtn.getAttribute('data-id');
                this.confirmSingleDelete(id);
            }
        });

        document.getElementById('confirm-cancel').addEventListener('click', () => this.toggleModal('confirm', false));
        document.getElementById('confirm-yes').addEventListener('click', () => this.handleConfirmedAction());
        document.getElementById('budget-cancel').addEventListener('click', () => this.toggleModal('budget', false));
        document.getElementById('budget-save').addEventListener('click', () => this.handleBudgetSave());
        window.addEventListener('scroll', () => document.getElementById('scroll-top').classList.toggle('show', window.scrollY > 300));
        document.getElementById('scroll-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
        document.getElementById('delete-all-btn').addEventListener('click', () => this.confirmAction('deleteAll', 'Hapus Semua Data?', 'Semua transaksi dan anggaran akan dihapus secara permanen.'));
        document.getElementById('import-excel-btn').addEventListener('click', () => document.getElementById('import-file').click());
        document.getElementById('import-file').addEventListener('change', (e) => this.handleImport(e));
        document.getElementById('export-excel').addEventListener('click', () => this.exportExcel(this.getFilteredData()));
        document.getElementById('export-pdf').addEventListener('click', () => this.exportPDF(this.getFilteredData()));
        document.getElementById('cancel-edit').addEventListener('click', () => this.resetForm());
        document.getElementById('set-budget-btn').addEventListener('click', () => { const cat = document.getElementById('category').value; this.openBudgetModal(cat); });
    },

    applyPreset(preset) {
        const now = new Date(); let start = new Date();
        if (preset === 'this-week') {
            // Indonesia: Week starts Monday
            const day = now.getDay();
            const diff = now.getDate() - (day === 0 ? 6 : day - 1);
            start.setDate(diff);
        }
        else if (preset === 'this-month') start.setDate(1);
        else if (preset === 'last-30-days') start.setDate(now.getDate() - 30);
        else { this.startDate = ''; this.endDate = ''; this.elements.filterStartDate.value = ''; this.elements.filterEndDate.value = ''; return; }
        this.startDate = start.toISOString().split('T')[0]; this.endDate = now.toISOString().split('T')[0];
        this.elements.filterStartDate.value = this.startDate; this.elements.filterEndDate.value = this.endDate;
    },

    confirmAction(action, title, text) {
        this.pendingAction = action;
        document.getElementById('confirm-title').innerText = title;
        document.getElementById('confirm-text').innerText = text;
        this.toggleModal('confirm', true);
    },

    handleConfirmedAction() {
        if (this.pendingAction === 'deleteAll') TransactionManager.deleteAll();
        else if (this.pendingAction === 'deleteSingle') TransactionManager.delete(this.deleteId);
        this.toggleModal('confirm', false);
        this.updateUI();
    },

    openBudgetModal(cat) {
        document.getElementById('budget-cat-display').value = cat;
        document.getElementById('budget-amount-input').value = TransactionManager.budgets[cat] || '';
        this.toggleModal('budget', true);
    },

    handleBudgetSave() {
        const cat = document.getElementById('budget-cat-display').value;
        const amount = parseFloat(document.getElementById('budget-amount-input').value);
        if (!isNaN(amount) && amount >= 0) { TransactionManager.setBudget(cat, amount); this.toggleModal('budget', false); this.updateUI(); }
        else alert('Masukkan angka yang valid');
    },

    handleFormSubmit(e) {
        e.preventDefault();
        if (!this.validateForm()) return;
        const formData = {
            desc: document.getElementById('desc').value.trim(),
            amount: parseFloat(document.getElementById('amount').value),
            date: document.getElementById('date').value,
            category: document.getElementById('category').value,
            type: document.querySelector('input[name="type"]:checked').value,
            recurring: document.getElementById('recurring').checked,
            recurringPeriod: document.getElementById('recurring-period').value
        };
        const editId = document.getElementById('edit-id').value;
        if (editId) TransactionManager.update(editId, formData);
        else TransactionManager.add(formData);
        this.resetForm(); this.updateUI();
    },

    handleImport(e) {
        const file = e.target.files[0]; if (!file) return;
        const mode = confirm("Tambahkan data ke data yang sudah ada? (Klik Batal untuk Menghapus data lama dan Timpa)") ? 'append' : 'overwrite';
        this.showLoader();
        const reader = new FileReader();
        reader.onload = (evt) => {
            const processImport = () => {
                try {
                    const dataArray = evt.target.result;
                    const wb = XLSX.read(new Uint8Array(dataArray), { type: 'array' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const data = XLSX.utils.sheet_to_json(ws);
                    if (mode === 'overwrite') TransactionManager.deleteAll();
                    let success = 0, fail = 0;
                    const errors = [];

                    data.forEach((item, index) => {
                        // Cerdas ekstraksi angka: hapus simbol Rp, titik ribuan, dll
                        const cleanAmount = (str) => {
                            if (typeof str === 'number') return str;
                            return parseFloat(String(str || '').replace(/[^\d.,]/g, '').replace(/,/g, '.'));
                        };

                        const amount = cleanAmount(item.Jumlah);
                        const date = item.Tanggal || new Date().toISOString().split('T')[0];
                        
                        if (item.Keterangan && amount > 0 && !isNaN(new Date(date).getTime())) {
                            TransactionManager.add({ 
                                desc: item.Keterangan, 
                                amount, 
                                category: item.Kategori || 'Lainnya', 
                                type: item.Tipe === 'Pemasukan' ? 'income' : 'expense', 
                                date: date, 
                                recurring: false 
                            });
                            success++;
                        } else {
                            fail++;
                            errors.push(`Baris ${index + 2}: ${item.Keterangan || 'Tanpa keterangan'} (Data tidak valid)`);
                        }
                    });
                    
                    this.updateUI(); 
                    let message = `Impor selesai: ${success} berhasil, ${fail} gagal.`;
                    if (fail > 0) {
                        console.warn('Detail kegagalan impor:', errors);
                        message += `\n\nBeberapa baris gagal diimpor. Cek konsol (F12) untuk detailnya.`;
                    }
                    alert(message);
                } catch (err) { 
                    console.error('Import Error:', err);
                    alert('Gagal membaca file. Pastikan format Excel/CSV sesuai.'); 
                } finally { 
                    this.hideLoader(); 
                    e.target.value = ''; 
                }
            };

            if (window.requestIdleCallback) {
                requestIdleCallback(processImport);
            } else {
                processImport();
            }
        };
        reader.readAsArrayBuffer(file);
    },

    validateForm() {
        let isValid = true;
        const desc = document.getElementById('desc').value.trim();
        const amount = parseFloat(document.getElementById('amount').value);
        const date = document.getElementById('date').value;
        const today = new Date().toISOString().split('T')[0];
        ['desc', 'amount', 'date'].forEach(id => { document.getElementById(`${id}-error`).classList.add('hidden'); document.getElementById(id).classList.remove('border-red-500'); });
        if (!desc) { document.getElementById('desc-error').classList.remove('hidden'); document.getElementById('desc').classList.add('border-red-500'); isValid = false; }
        if (isNaN(amount) || amount <= 0) { document.getElementById('amount-error').classList.remove('hidden'); document.getElementById('amount').classList.add('border-red-500'); isValid = false; }
        if (!date || date > today) { document.getElementById('date-error').innerText = date > today ? 'Tidak boleh di masa depan' : 'Wajib diisi'; document.getElementById('date-error').classList.remove('hidden'); document.getElementById('date').classList.add('border-red-500'); isValid = false; }
        return isValid;
    },

    getFilteredData() {
        return TransactionManager.transactions.filter(t => {
            const matchesSearch = t.desc.toLowerCase().includes(this.searchQuery) || t.category.toLowerCase().includes(this.searchQuery);
            const matchesType = this.filterType === 'all' || t.type === this.filterType;
            const matchesCat = this.filterCategory === 'all' || t.category === this.filterCategory;
            const matchesStart = !this.startDate || t.date >= this.startDate;
            const matchesEnd = !this.endDate || t.date <= this.endDate;
            return matchesSearch && matchesType && matchesCat && matchesStart && matchesEnd;
        });
    },

    updateUI() {
        this.showLoader();
        const filtered = this.getFilteredData();
        const summary = TransactionManager.getSummary(filtered);
        this.elements.totalIncome.innerText = this.formatCurrency(summary.income);
        this.elements.totalExpense.innerText = this.formatCurrency(summary.expense);
        this.elements.totalBalance.innerText = this.formatCurrency(summary.balance);
        filtered.sort((a, b) => this.sortOrder === 'desc' ? new Date(b.date) - new Date(a.date) : new Date(a.date) - new Date(b.date));
        const totalItems = filtered.length;
        const totalPages = Math.ceil(totalItems / this.itemsPerPage);
        if (this.currentPage > totalPages) this.currentPage = Math.max(1, totalPages);
        const start = (this.currentPage - 1) * this.itemsPerPage;
        const paginated = filtered.slice(start, start + this.itemsPerPage);
        this.renderTable(paginated); this.updatePagination(totalItems, start, paginated.length);
        this.updateCategoryFilter(); // Synchronize dynamic category filter
        this.updateTopExpenses(); this.updateBudgetAlerts(); ChartManager.updateCharts(filtered);
        this.hideLoader();
    },

    updateCategoryFilter() {
        const categories = Array.from(new Set(TransactionManager.transactions.map(t => t.category))).sort();
        const select = this.elements.filterCategory;
        const currentValue = select.value;

        // Clear except "all"
        select.innerHTML = '<option value="all">Semua Kategori</option>';
        
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            select.appendChild(option);
        });

        // Restore selection if it still exists
        if (categories.includes(currentValue)) {
            select.value = currentValue;
        } else {
            this.filterCategory = 'all';
        }
    },

    renderTable(data) {
        this.elements.transactionList.innerHTML = '';
        if (data.length === 0) { this.elements.transactionList.innerHTML = `<tr><td colspan="5" class="px-6 py-10 text-center text-slate-400 italic">Data tidak ditemukan</td></tr>`; return; }
        
        let html = '';
        data.forEach(t => {
            html += `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors group">
                    <td class="px-6 py-4 text-slate-500 font-medium">${new Date(t.date).toLocaleDateString('id-ID')}${t.recurring ? `<i class="fas fa-sync-alt ml-1 text-blue-400" title="Berulang: ${t.recurringPeriod}"></i>` : ''}</td>
                    <td class="px-6 py-4 font-semibold text-slate-700">${this.sanitize(t.desc)}</td>
                    <td class="px-6 py-4"><span class="px-2 py-1 bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-md text-[10px] font-bold uppercase">${this.sanitize(t.category)}</span></td>
                    <td class="px-6 py-4 font-bold ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}">${t.type === 'income' ? '+' : '-'} ${this.formatCurrency(t.amount)}</td>
                    <td class="px-6 py-4 text-center"><div class="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button data-action="edit" data-id="${t.id}" class="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"><i class="fas fa-edit"></i></button>
                        <button data-action="delete" data-id="${t.id}" class="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><i class="fas fa-trash-alt"></i></button>
                    </div></td>
                </tr>`;
        });
        this.elements.transactionList.innerHTML = html;
    },

    updateTopExpenses() {
        const top = TransactionManager.getTopExpenses();
        this.elements.topExpensesList.innerHTML = top.length ? '' : '<p class="text-xs text-slate-400 italic">Belum ada pengeluaran bulan ini</p>';
        let html = '';
        top.forEach(t => {
            html += `<div class="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <div class="flex flex-col"><span class="text-xs font-bold text-slate-700">${this.sanitize(t.desc)}</span><span class="text-[10px] text-slate-400">${t.category}</span></div><span class="text-xs font-bold text-red-500">${this.formatCurrency(t.amount)}</span>
            </div>`;
        });
        this.elements.topExpensesList.innerHTML = html;
    },

    updateBudgetAlerts() {
        const budgetStatus = TransactionManager.getBudgetStatus();
        if (budgetStatus.length === 0) { this.elements.budgetSection.classList.add('hidden'); return; }
        this.elements.budgetSection.classList.remove('hidden'); 
        let html = '';
        budgetStatus.forEach(b => {
            const percent = (b.spent / b.budget * 100).toFixed(0); const isOver = b.spent > b.budget;
            html += `<div class="p-3 rounded-lg text-xs ${isOver ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}">
                <div class="flex justify-between font-bold mb-1"><span>${b.category}</span><span>${percent}%</span></div><div class="w-full bg-slate-200 dark:bg-slate-600 h-1.5 rounded-full overflow-hidden"><div class="h-full ${isOver ? 'bg-red-500' : 'bg-amber-500'}" style="width: ${Math.min(percent, 100)}%"></div></div><p class="mt-1 font-medium">${isOver ? 'Melebihi anggaran!' : 'Mendekati anggaran (80%+)'}</p>
            </div>`;
        });
        this.elements.budgetAlerts.innerHTML = html;
    },

    updatePagination(total, start, count) {
        if (total === 0) { this.elements.paginationInfo.innerText = 'Tidak ada data'; this.elements.prevPage.disabled = this.elements.nextPage.disabled = true; return; }
        this.elements.paginationInfo.innerText = `Menampilkan ${start + 1}-${start + count} dari ${total}`; this.elements.prevPage.disabled = this.currentPage === 1; this.elements.nextPage.disabled = start + count >= total;
    },

    confirmSingleDelete(id) { this.deleteId = id; this.confirmAction('deleteSingle', 'Hapus Transaksi?', 'Transaksi ini akan dihapus permanen.'); },
    toggleModal(type, show) { const modal = document.getElementById(type === 'confirm' ? 'confirm-modal' : 'budget-modal'); modal.classList.toggle('hidden', !show); },
    editTransaction(id) {
        const t = TransactionManager.transactions.find(t => t.id === id); if (!t) return;
        document.getElementById('edit-id').value = t.id; document.getElementById('desc').value = t.desc; document.getElementById('amount').value = t.amount; document.getElementById('date').value = t.date; document.getElementById('category').value = t.category;
        document.querySelector(`input[name="type"][value="${t.type}"]`).checked = true; document.getElementById('recurring').checked = !!t.recurring; document.getElementById('recurring-period').value = t.recurringPeriod || 'monthly'; document.getElementById('recurring-options').classList.toggle('hidden', !t.recurring);
        document.getElementById('form-title').innerHTML = `<i class="fas fa-edit text-blue-500"></i> Edit Transaksi`; document.getElementById('submit-btn').querySelector('span').innerText = 'Update'; document.getElementById('cancel-edit').classList.remove('hidden');
        window.scrollTo({ top: document.getElementById('transaksi').offsetTop - 100, behavior: 'smooth' });
    },
    resetForm() { this.elements.transactionForm.reset(); document.getElementById('edit-id').value = ''; document.getElementById('form-title').innerHTML = `<i class="fas fa-plus-circle text-blue-500"></i> Tambah Transaksi`; document.getElementById('submit-btn').querySelector('span').innerText = 'Simpan'; document.getElementById('cancel-edit').classList.add('hidden'); document.getElementById('recurring-options').classList.add('hidden'); this.setDefaultDate(); },
    setDefaultDate() { document.getElementById('date').valueAsDate = new Date(); },
    validateDateRange() { if (this.startDate && this.endDate && this.startDate > this.endDate) { const temp = this.startDate; this.startDate = this.endDate; this.endDate = temp; this.elements.filterStartDate.value = this.startDate; this.elements.filterEndDate.value = this.endDate; } },
    formatCurrency(num) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num); },
    sanitize(str) { const temp = document.createElement('div'); temp.textContent = str; return temp.innerHTML; },
    showLoader() { this.elements.loader.style.opacity = '1'; this.elements.loader.classList.remove('pointer-events-none'); },
    hideLoader() { setTimeout(() => { this.elements.loader.style.opacity = '0'; this.elements.loader.classList.add('pointer-events-none'); }, 300); },
    getExportFilename(extension) {
        const dateStr = new Date().toISOString().split('T')[0];
        let filename = `FinTrack_Report_${dateStr}`;
        
        const start = this.elements.filterStartDate.value;
        const end = this.elements.filterEndDate.value;
        
        if (start && end) {
            filename = `FinTrack_Report_${start}_to_${end}`;
        } else if (start) {
            filename = `FinTrack_Report_from_${start}`;
        } else if (end) {
            filename = `FinTrack_Report_until_${end}`;
        } else {
            // If no dates, check preset
            const preset = this.elements.filterPreset.value;
            if (preset !== 'all') {
                filename = `FinTrack_Report_${preset}_${dateStr}`;
            }
        }
        
        return `${filename}.${extension}`;
    },

    exportExcel(filteredData) {
        this.showLoader(); setTimeout(() => {
            const data = (filteredData || TransactionManager.transactions).map(t => ({ Tanggal: t.date, Keterangan: t.desc, Kategori: t.category, Tipe: t.type === 'income' ? 'Pemasukan' : 'Pengeluaran', Jumlah: t.amount }));
            const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "FinTrack"); 
            XLSX.writeFile(wb, this.getExportFilename('xlsx')); this.hideLoader();
        }, 500);
    },
    exportPDF(filteredData) {
        this.showLoader(); setTimeout(() => {
            const { jsPDF } = window.jspdf; const doc = new jsPDF(); 
            doc.setFontSize(18); doc.text("FinTrack - Laporan Keuangan", 14, 22);
            
            const data = filteredData || TransactionManager.transactions; const summary = TransactionManager.getSummary(data);
            doc.setFontSize(11); 
            doc.text(`Total Pemasukan: ${this.formatCurrency(summary.income)}`, 14, 32); 
            doc.text(`Total Pengeluaran: ${this.formatCurrency(summary.expense)}`, 14, 38); 
            doc.text(`Saldo Akhir: ${this.formatCurrency(summary.balance)}`, 14, 44);
            
            const tableData = data.map(t => [t.date, t.desc, t.category, t.type === 'income' ? 'Masuk' : 'Keluar', t.amount]);
            doc.autoTable({ 
                head: [['Tanggal', 'Keterangan', 'Kategori', 'Tipe', 'Jumlah']], 
                body: tableData, 
                startY: 50, 
                theme: 'striped',
                margin: { top: 20, bottom: 20, left: 14, right: 14 },
                didDrawPage: (data) => {
                    // Add footer with page number
                    const str = "Halaman " + doc.internal.getNumberOfPages();
                    doc.setFontSize(10);
                    const pageSize = doc.internal.pageSize;
                    const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
                    doc.text(str, data.settings.margin.left, pageHeight - 10);
                }
            });
            doc.save(this.getExportFilename('pdf')); this.hideLoader();
        }, 500);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    UIController.init();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').then(() => console.log('FinTrack SW Registered'));
});
