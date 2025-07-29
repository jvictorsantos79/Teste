

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from '@google/genai';
import * as XLSX from 'xlsx';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, addDoc, deleteDoc, updateDoc, arrayUnion, setDoc, writeBatch } from 'firebase/firestore';


// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyABvSCVYD1an4nKYeyxj-8zSsBLlQI1KQQ",
  authDomain: "dashboard-ped-2025.firebaseapp.com",
  projectId: "dashboard-ped-2025",
  storageBucket: "dashboard-ped-2025.appspot.com",
  messagingSenderId: "300543297540",
  appId: "1:300543297540:web:78e1776b4083ddf7050d51",
  measurementId: "G-WBVGNNEPWY"
};

// --- TYPE DEFINITIONS ---
interface Voter {
    id: string;
    cnf: string;
    nome: string;
    apoiador?: string;
    localVotacao?: string;
    urna?: string | number;
    assinou: boolean;
    email?: string;
    telefone?: string;
    isWhatsapp?: boolean;
    photoURL?: string;
    numero?: number;
    tituloEleitor?: string;
    redesSociais?: string;
    partido?: string;
    dataFiliacao?: string;
    endereco?: {
        cep?: string;
        logradouro?: string;
        numero?: string;
        complemento?: string;
    };
}

interface AdminItem {
    id: string;
    name: string;
    urnas?: number[];
}

interface ExtractedVoter {
    numero?: string;
    nome: string;
    cnf: string;
    assinou: boolean;
}

interface ExtractedData {
    localVotacao: string;
    urna: string;
    eleitores: ExtractedVoter[];
}


// --- GLOBAL STATE & VERSIONING ---
const APP_VERSION = '1.6.1';
const changelog = [
     {
        version: '1.6.1',
        date: '2024-08-04',
        changes: [
            '**Correção:** Corrigido o valor de `storageBucket` na configuração do Firebase para resolver erros de conexão com o backend.',
            '**Correção:** A função "Gerar Relatório" agora sanitiza os dados antes de enviá-los à IA, prevenindo o erro "Converting circular structure to JSON" e garantindo a estabilidade da funcionalidade.'
        ]
    },
    {
        version: '1.6.0',
        date: '2024-08-03',
        changes: [
            '**Recurso Estrutural:** Migração completa do armazenamento de dados para o Firebase Firestore.',
            '**Melhoria:** Todos os dados (eleitores, locais, lideranças) agora são persistidos na nuvem e sincronizados em tempo real.',
            '**Recurso Adicionado:** Login funcional com Firebase Authentication. As contas são criadas automaticamente no primeiro acesso.',
            '**Melhoria:** O processo de importação de arquivos foi otimizado para salvar dados em lote no banco de dados, aumentando a velocidade e a confiabilidade.',
            '**Correção:** A aplicação agora funciona de forma persistente entre sessões e dispositivos.'
        ]
    },
    {
        version: '1.5.1',
        date: '2024-08-02',
        changes: [
            '**Correção:** Corrigido problema de transparência no fundo dos modais, garantindo que tenham um fundo opaco para melhorar a legibilidade.'
        ]
    },
    {
        version: '1.5.0',
        date: '2024-08-01',
        changes: [
            '**Recurso Adicionado:** Sistema completo de personalização de aparência com um modal dedicado.',
            '**Recurso Adicionado:** 12 novos temas de cores para a interface, além dos modos claro e escuro.',
            '**Melhoria:** O botão de tema foi substituído por um ícone de paleta de cores que abre o novo painel de "Aparência".',
            '**Melhoria:** As preferências de tema e modo agora são salvas no navegador.',
            '**Correção:** Corrigidos múltiplos erros de tipo (TypeScript) que impediam o funcionamento correto da aplicação.'
        ]
    }
];
const themes = [
    { name: 'Padrão', className: 'theme-default' }, { name: 'Cinza claro', className: 'theme-light-gray' }, { name: 'Verde menta', className: 'theme-mint-green' }, { name: 'Verde ciano', className: 'theme-cyan-green' }, { name: 'Azul claro', className: 'theme-light-blue' }, { name: 'Rosa', className: 'theme-pink' }, { name: 'Chiclete', className: 'theme-bubblegum' }, { name: 'Amarelo mel', className: 'theme-honey-yellow' }, { name: 'Amarelo alaranjado', className: 'theme-orange-yellow' }, { name: 'Cinza escuro', className: 'theme-dark-gray' }, { name: 'Azul acinzentado', className: 'theme-grayish-blue' }, { name: 'Roxo', className: 'theme-purple' }, { name: 'Vermelho', className: 'theme-red' }, { name: 'Verde musgo', className: 'theme-moss-green' },
];

let votersData: Voter[] = [];
let leadersData: AdminItem[] = [];
let locationsData: AdminItem[] = [];
let electionsData: AdminItem[] = [];
let currentFilteredData: Voter[] = [];
let currentPage = 1;
let itemsPerPage = 10;
let selectedVoterIds = new Set<string>();
let activeSort: { column: keyof Voter | string, direction: 'asc' | 'desc' } = { column: 'nome', direction: 'asc' };
let activeFilters: { [key: string]: Set<string> } = {};
let openFilterColumn: string | null = null;
let unsubscribeListeners: (() => void)[] = [];


// --- FIREBASE & GEMINI SETUP ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
declare const pdfjsLib: any;

// --- DOM ELEMENT SELECTORS ---
const DOMElements = {
    loginScreen: document.getElementById('login-screen') as HTMLElement,
    dashboardScreen: document.getElementById('dashboard-screen') as HTMLElement,
    emailInput: document.getElementById('email') as HTMLInputElement,
    passwordInput: document.getElementById('password') as HTMLInputElement,
    authError: document.getElementById('auth-error') as HTMLElement,
    dashboardVersionLink: document.getElementById('dashboardVersionLink') as HTMLButtonElement,
    loginBtn: document.getElementById('loginBtn') as HTMLButtonElement,
    logoutBtn: document.getElementById('logoutBtn') as HTMLButtonElement,
    appearanceBtn: document.getElementById('appearanceBtn') as HTMLButtonElement,
    tableHeader: document.getElementById('table-header') as HTMLElement,
    votersTableBody: document.getElementById('votersTableBody') as HTMLElement,
    paginationControls: document.getElementById('pagination-controls') as HTMLElement,
    searchInput: document.getElementById('searchInput') as HTMLInputElement,
    selectAllCheckbox: document.getElementById('selectAllCheckbox') as HTMLInputElement,
    filterDropdownContainer: document.getElementById('filter-dropdown-container') as HTMLElement,
    // Modals
    adminModal: document.getElementById('adminModal') as HTMLElement,
    adminModalBackdrop: document.getElementById('adminModalBackdrop') as HTMLElement,
    voterModal: document.getElementById('voterModal') as HTMLElement,
    voterModalBackdrop: document.getElementById('voterModalBackdrop') as HTMLElement,
    aiModal: document.getElementById('aiModal') as HTMLElement,
    aiModalBackdrop: document.getElementById('aiModalBackdrop') as HTMLElement,
    changelogModal: document.getElementById('changelogModal') as HTMLElement,
    changelogModalBackdrop: document.getElementById('changelogModalBackdrop') as HTMLElement,
    appearanceModal: document.getElementById('appearanceModal') as HTMLElement,
    appearanceModalBackdrop: document.getElementById('appearanceModalBackdrop') as HTMLElement,
    // Modal Controls
    openAdminBtn: document.getElementById('adminBtn') as HTMLButtonElement,
    closeAdminModalBtn: document.getElementById('closeAdminModalBtn') as HTMLButtonElement,
    addVoterBtn: document.getElementById('addVoterBtn') as HTMLButtonElement,
    closeVoterModalBtn: document.getElementById('closeVoterModalBtn') as HTMLButtonElement,
    closeAiModalBtn: document.getElementById('closeAiModalBtn') as HTMLButtonElement,
    closeChangelogModalBtn: document.getElementById('closeChangelogModalBtn') as HTMLButtonElement,
    closeAppearanceModalBtn: document.getElementById('closeAppearanceModalBtn') as HTMLButtonElement,
    // Appearance Modal
    lightModeBtn: document.getElementById('lightModeBtn') as HTMLButtonElement,
    darkModeBtn: document.getElementById('darkModeBtn') as HTMLButtonElement,
    themeGrid: document.getElementById('theme-grid') as HTMLElement,
    // Voter Form
    voterForm: document.getElementById('voterForm') as HTMLFormElement,
    voterModalTitle: document.getElementById('voterModalTitle') as HTMLElement,
    voterError: document.getElementById('voter-error') as HTMLElement,
    voterPhotoPreview: document.getElementById('voterPhotoPreview') as HTMLImageElement,
    voterPhotoInput: document.getElementById('voterPhoto') as HTMLInputElement,
    chooseFileBtn: document.getElementById('chooseFileBtn') as HTMLButtonElement,
    voterLocalSelect: document.getElementById('voterLocal') as HTMLSelectElement,
    voterUrnaSelect: document.getElementById('voterUrna') as HTMLSelectElement,
    voterCepInput: document.getElementById('voterCep') as HTMLInputElement,
    voterLogradouroInput: document.getElementById('voterLogradouro') as HTMLInputElement,
    // Admin Panel
    adminModalBody: document.getElementById('adminModalBody') as HTMLElement,
    locationForm: document.getElementById('locationForm') as HTMLFormElement,
    leaderForm: document.getElementById('leaderForm') as HTMLFormElement,
    electionForm: document.getElementById('electionForm') as HTMLFormElement,
    locationsList: document.getElementById('locationsList') as HTMLElement,
    leadersList: document.getElementById('leadersList') as HTMLElement,
    electionsList: document.getElementById('electionsList') as HTMLElement,
    // Main Controls
    fileUpload: document.getElementById('fileUpload') as HTMLInputElement,
    uploadContainer: document.getElementById('uploadContainer') as HTMLElement,
    uploadStatus: document.getElementById('uploadStatus') as HTMLElement,
    generateReportBtn: document.getElementById('generateReportBtn') as HTMLButtonElement,
    draftMessageBtn: document.getElementById('draftMessageBtn') as HTMLButtonElement,
    exportXLSXBtn: document.getElementById('exportXLSXBtn') as HTMLButtonElement,
    // AI & Changelog Modals
    aiModalTitle: document.getElementById('aiModalTitle') as HTMLElement,
    aiModalBody: document.getElementById('aiModalBody') as HTMLElement,
    changelogModalBody: document.getElementById('changelogModalBody') as HTMLElement,
};

// --- AUTHENTICATION ---
onAuthStateChanged(auth, user => {
    if (user) {
        DOMElements.loginScreen.classList.add('hidden');
        DOMElements.dashboardScreen.classList.remove('hidden');
        loadAllData(user.uid);
    } else {
        DOMElements.dashboardScreen.classList.add('hidden');
        DOMElements.loginScreen.classList.remove('hidden');
        unsubscribeListeners.forEach(unsub => unsub());
        unsubscribeListeners = [];
        votersData = [];
        applyFiltersAndSort();
    }
});
const handleLogin = async () => {
    const email = DOMElements.emailInput.value;
    const password = DOMElements.passwordInput.value;
    DOMElements.authError.textContent = '';
    if (!email || !password) {
        DOMElements.authError.textContent = 'Por favor, preencha e-mail e senha.';
        return;
    }
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            try {
                await createUserWithEmailAndPassword(auth, email, password);
            } catch (createError: any) {
                DOMElements.authError.textContent = `Erro ao criar conta: ${createError.message}`;
            }
        } else {
             DOMElements.authError.textContent = `Erro ao entrar: ${error.message}`;
        }
    }
};

// --- FIRESTORE DATA HANDLING ---
function loadAllData(userId: string) {
    if (!userId) return;
    const collectionsToLoad = [
        { name: 'voters', stateVar: 'votersData', callback: (data: any[]) => { votersData = data as Voter[]; applyFiltersAndSort(); } },
        { name: 'leaders', stateVar: 'leadersData', callback: (data: any[]) => { leadersData = data as AdminItem[]; renderAdminLists(); } },
        { name: 'locations', stateVar: 'locationsData', callback: (data: any[]) => { locationsData = data as AdminItem[]; renderAdminLists(); } },
        { name: 'elections', stateVar: 'electionsData', callback: (data: any[]) => { electionsData = data as AdminItem[]; renderAdminLists(); } }
    ];
    
    unsubscribeListeners.forEach(unsub => unsub());
    unsubscribeListeners = [];

    collectionsToLoad.forEach(({ name, callback }) => {
        const collRef = collection(db, 'users', userId, name);
        const unsubscribe = onSnapshot(collRef, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        }, (error) => console.error(`Erro ao carregar ${name}:`, error));
        unsubscribeListeners.push(unsubscribe);
    });
}

// --- MODAL MANAGEMENT & THEME ---
const openModal = (modal: HTMLElement, backdrop: HTMLElement) => { modal.style.display = 'block'; backdrop.style.display = 'block'; };
const closeModal = (modal: HTMLElement, backdrop: HTMLElement) => { modal.style.display = 'none'; backdrop.style.display = 'none'; };
const applyAppearance = (mode: string, theme: string) => {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(mode);
    DOMElements.lightModeBtn.classList.toggle('active', mode === 'light');
    DOMElements.darkModeBtn.classList.toggle('active', mode === 'dark');
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-swatch').forEach(swatch => {
        swatch.classList.toggle('active', swatch.getAttribute('data-theme') === theme);
    });
    localStorage.setItem('displayMode', mode);
    localStorage.setItem('colorTheme', theme);
};
const renderThemeOptions = () => {
    DOMElements.themeGrid.innerHTML = '';
    themes.forEach(theme => {
        const swatch = document.createElement('div');
        swatch.className = `theme-swatch ${theme.className}`;
        swatch.setAttribute('data-theme', theme.className);
        swatch.innerHTML = `<div class="theme-color-preview"></div><span>${theme.name}</span>`;
        DOMElements.themeGrid.appendChild(swatch);
    });
};

// --- DATA RENDERING & TABLE LOGIC --- (largely unchanged, minor adjustments for async data)
const updateSortIndicator = () => { DOMElements.tableHeader.querySelectorAll<HTMLElement>('.header-content').forEach(header => { const column = header.dataset.column; const indicator = header.querySelector('.sort-indicator'); if (indicator) indicator.remove(); if (column === activeSort.column) { const newIndicator = document.createElement('span'); newIndicator.className = 'sort-indicator'; newIndicator.innerHTML = activeSort.direction === 'asc' ? '↑' : '↓'; header.appendChild(newIndicator); } }); };
const renderTable = () => {
    const data = currentFilteredData;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedData = data.slice(startIndex, endIndex);

    if (!DOMElements.votersTableBody) return;
    DOMElements.votersTableBody.innerHTML = '';
    if (data.length === 0) { DOMElements.votersTableBody.innerHTML = `<tr><td colspan="7" class="text-center p-6 text-gray-500 dark:text-gray-400">Nenhum eleitor encontrado. Processe uma lista ou cadastre um novo.</td></tr>`; renderPaginationControls(); return; }
    
    paginatedData.forEach(voter => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 dark:hover:bg-gray-700';
        const isSelected = selectedVoterIds.has(voter.id);
        const attendanceStatus = voter.assinou ? `<span class="relative inline-block px-3 py-1 font-semibold text-green-900 leading-tight"><span aria-hidden class="absolute inset-0 bg-green-200 opacity-50 rounded-full"></span><span class="relative">Sim</span></span>` : `<span class="relative inline-block px-3 py-1 font-semibold text-red-900 leading-tight"><span aria-hidden class="absolute inset-0 bg-red-200 opacity-50 rounded-full"></span><span class="relative">Não</span></span>`;
        row.innerHTML = `
            <td class="px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"><input type="checkbox" class="voter-checkbox" data-id="${voter.id}" ${isSelected ? 'checked' : ''}></td>
            <td class="px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"><p class="text-gray-900 dark:text-gray-300 whitespace-no-wrap">${voter.cnf || 'N/A'}</p></td>
            <td class="px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"><p class="text-gray-900 dark:text-gray-300 whitespace-no-wrap">${voter.nome || 'N/A'}</p></td>
            <td class="px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"><p class="text-gray-900 dark:text-gray-300 whitespace-no-wrap">${voter.apoiador || ''}</p></td>
            <td class="px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"><p class="text-gray-900 dark:text-gray-300 whitespace-no-wrap">${voter.localVotacao || 'N/A'}</p></td>
            <td class="px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-center">${attendanceStatus}</td>
            <td class="px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-center"><button class="btn btn-secondary btn-edit" data-id="${voter.id}">Editar</button></td>
        `;
        DOMElements.votersTableBody.appendChild(row);
    });
    updateSelectAllCheckboxState();
    renderPaginationControls();
    updateSortIndicator();
};
const updateSelectAllCheckboxState = () => { const paginatedIds = currentFilteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(v => v.id); if (paginatedIds.length > 0) { const allVisibleSelected = paginatedIds.every(id => selectedVoterIds.has(id)); DOMElements.selectAllCheckbox.checked = allVisibleSelected; } else { DOMElements.selectAllCheckbox.checked = false; } };
const handleSelectAll = (e: Event) => { const target = e.target as HTMLInputElement; const isChecked = target.checked; const paginatedIds = currentFilteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(v => v.id); paginatedIds.forEach(id => { if (isChecked) { selectedVoterIds.add(id); } else { selectedVoterIds.delete(id); } }); renderTable(); };
const renderPaginationControls = () => {
    const totalItems = currentFilteredData.length; DOMElements.paginationControls.innerHTML = ''; if (totalItems <= 0) return;
    const totalPages = Math.ceil(totalItems / itemsPerPage); const startIndex = (currentPage - 1) * itemsPerPage + 1; const endIndex = Math.min(startIndex + itemsPerPage - 1, totalItems);
    const paginationDiv = document.createElement('div'); paginationDiv.className = "flex flex-col sm:flex-row items-center justify-between w-full";
    let paginationButtons = ''; const maxPagesToShow = 7; let startPage: number, endPage: number;
    if (totalPages <= maxPagesToShow) { startPage = 1; endPage = totalPages; } else { const maxPagesBeforeCurrent = Math.floor(maxPagesToShow / 2); const maxPagesAfterCurrent = Math.ceil(maxPagesToShow / 2) - 1; if (currentPage <= maxPagesBeforeCurrent) { startPage = 1; endPage = maxPagesToShow; } else if (currentPage + maxPagesAfterCurrent >= totalPages) { startPage = totalPages - maxPagesToShow + 1; endPage = totalPages; } else { startPage = currentPage - maxPagesBeforeCurrent; endPage = currentPage + maxPagesAfterCurrent; } }
    paginationButtons += `<button class="pagination-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>Anterior</button>`;
    if (startPage > 1) { paginationButtons += `<button class="pagination-btn" data-page="1">1</button>`; if (startPage > 2) { paginationButtons += `<span class="px-3">...</span>`; } }
    for (let i = startPage; i <= endPage; i++) { paginationButtons += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`; }
    if (endPage < totalPages) { if (endPage < totalPages - 1) { paginationButtons += `<span class="px-3">...</span>`; } paginationButtons += `<button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>`; }
    paginationButtons += `<button class="pagination-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Seguinte</button>`;
    paginationDiv.innerHTML = `<span class="text-xs xs:text-sm text-gray-900 dark:text-gray-400 mb-2 sm:mb-0">Mostrando ${startIndex} a ${endIndex} de ${totalItems} resultados</span><div class="inline-flex items-center gap-2">${paginationButtons}</div>`;
    DOMElements.paginationControls.appendChild(paginationDiv);
};
const applyFiltersAndSort = () => {
    const searchTerm = DOMElements.searchInput.value.toLowerCase();
    let filtered = votersData.filter(voter => {
        const searchMatch = !searchTerm || (voter.nome || '').toLowerCase().includes(searchTerm) || (voter.cnf || '').toLowerCase().includes(searchTerm);
        if (!searchMatch) return false;
        for (const column in activeFilters) { if (activeFilters[column].size > 0) { let value = voter[column as keyof Voter]; if (column === 'assinou') { value = value ? 'Sim' : 'Não'; } if (!activeFilters[column].has(String(value || ''))) { return false; } } }
        return true;
    });
    filtered.sort((a, b) => { let valA = a[activeSort.column as keyof Voter] || ''; let valB = b[activeSort.column as keyof Voter] || ''; if (typeof valA === 'boolean' || typeof valB === 'boolean') { valA = String(valA); valB = String(valB); } if (typeof valA === 'number' && typeof valB === 'number') { return activeSort.direction === 'asc' ? valA - valB : valB - valA; } return activeSort.direction === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA)); });
    currentFilteredData = filtered; currentPage = 1; renderTable();
};
const closeFilterDropdown = () => { if (openFilterColumn) { const btn = DOMElements.tableHeader.querySelector(`.header-content[data-column="${openFilterColumn}"] .filter-btn`); if(btn) btn.classList.remove('active'); } DOMElements.filterDropdownContainer.innerHTML = ''; openFilterColumn = null; document.removeEventListener('click', handleOutsideClick, true); };
const handleOutsideClick = (event: MouseEvent) => { if (!DOMElements.filterDropdownContainer.contains(event.target as Node)) { closeFilterDropdown(); } };
const renderFilterDropdown = (columnKey: string, targetButton: HTMLElement) => {
    if (openFilterColumn === columnKey) { closeFilterDropdown(); return; }
    closeFilterDropdown(); openFilterColumn = columnKey; targetButton.classList.add('active');
    if (!activeFilters[columnKey]) { activeFilters[columnKey] = new Set(); }
    const currentColumnFilters = activeFilters[columnKey];
    const dropdown = document.createElement('div'); dropdown.className = 'filter-dropdown';
    let uniqueValues = [...new Set(votersData.map(v => { if (columnKey === 'assinou') return v.assinou ? 'Sim' : 'Não'; return v[columnKey as keyof Voter] || ''; }))].sort((a,b) => String(a).localeCompare(String(b)));
    dropdown.innerHTML = `<div class="space-y-2"><div class="sort-item" data-action="sort" data-direction="asc"><i class="fas fa-sort-alpha-down w-4"></i> Classificar de A a Z</div><div class="sort-item" data-action="sort" data-direction="desc"><i class="fas fa-sort-alpha-up w-4"></i> Classificar de Z a A</div><hr class="dark:border-gray-600"><div class="px-3 py-1 font-semibold">Filtrar por valor</div><div class="filter-values-list space-y-1 p-1">${uniqueValues.map(value => `<label class="filter-item"><input type="checkbox" class="filter-checkbox" value="${value}" ${currentColumnFilters.has(String(value)) ? 'checked' : ''}><span>${value || '(Vazio)'}</span></label>`).join('')}</div><hr class="dark:border-gray-600"><div class="flex justify-end gap-2 pt-1"><button data-action="clear" class="btn btn-secondary btn-edit">Limpar</button><button data-action="apply" class="btn btn-primary btn-edit">Aplicar</button></div></div>`;
    const rect = targetButton.getBoundingClientRect(); dropdown.style.position = 'absolute'; dropdown.style.top = `${rect.bottom + window.scrollY}px`; dropdown.style.left = `${rect.left + window.scrollX}px`;
    DOMElements.filterDropdownContainer.appendChild(dropdown);
    dropdown.addEventListener('click', (e) => { e.stopPropagation(); const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement; if (!target) return; const action = target.dataset.action; if(action === 'sort') { activeSort = { column: columnKey, direction: (target.dataset.direction as 'asc' | 'desc') }; closeFilterDropdown(); applyFiltersAndSort(); } else if (action === 'apply') { const newFilterSet = new Set<string>(); dropdown.querySelectorAll<HTMLInputElement>('.filter-checkbox:checked').forEach(cb => { newFilterSet.add(cb.value); }); activeFilters[columnKey] = newFilterSet; closeFilterDropdown(); applyFiltersAndSort(); } else if (action === 'clear') { activeFilters[columnKey].clear(); closeFilterDropdown(); applyFiltersAndSort(); } });
    setTimeout(() => document.addEventListener('click', handleOutsideClick, true), 0);
};

// --- ADMIN PANEL LOGIC ---
function renderAdminLists() {
    if (!DOMElements.locationsList || !DOMElements.leadersList || !DOMElements.electionsList) return;
    const renderList = (element: HTMLElement, data: AdminItem[], type: string) => {
        element.innerHTML = '';
        data.sort((a,b) => a.name.localeCompare(b.name)).forEach(item => {
            if (type === 'location') {
                const div = document.createElement('div');
                div.className = 'p-2 border-b dark:border-gray-700';
                div.innerHTML = `
                    <div class="flex justify-between items-center">
                        <span>${item.name}</span>
                        <button class="text-red-500 hover:text-red-700" data-id="${item.id}" data-action="delete-${type}">&times;</button>
                    </div>
                    <div class="pl-4 mt-2">
                        <form class="flex gap-2" data-id="${item.id}" data-action="add-urna">
                            <input type="number" placeholder="Nº Urna" class="flex-grow border p-1 rounded-md dark:bg-gray-700 dark:border-gray-600 w-full" required>
                            <button type="submit" class="btn btn-secondary btn-edit">Add Urna</button>
                        </form>
                        <ul class="text-sm mt-1 list-disc pl-5">${(item.urnas || []).sort((a: number,b: number) => a-b).map((u: number) => `<li>Urna ${u}</li>`).join('')}</ul>
                    </div>
                `;
                element.appendChild(div);
            } else {
                const li = document.createElement('li');
                li.innerHTML = `${item.name} <button class="text-red-500 ml-2 hover:text-red-700" data-id="${item.id}" data-action="delete-${type}">&times;</button>`;
                element.appendChild(li);
            }
        });
    };
    renderList(DOMElements.locationsList, locationsData, 'location');
    renderList(DOMElements.leadersList, leadersData, 'leader');
    renderList(DOMElements.electionsList, electionsData, 'election');
};
async function handleAdminFormSubmit(e: SubmitEvent, type: 'location' | 'leader' | 'election') {
    e.preventDefault();
    const user = auth.currentUser; if (!user) return;
    const form = e.target as HTMLFormElement;
    const input = form.querySelector('input') as HTMLInputElement;
    const name = input.value.trim();
    if (!name) return;
    const collRef = collection(db, 'users', user.uid, `${type}s`);
    const newItem: { name: string, urnas?: number[] } = { name };
    if (type === 'location') newItem.urnas = [];
    await addDoc(collRef, newItem);
    input.value = '';
};
async function handleAdminAction (e: Event) {
    const user = auth.currentUser; if (!user) return;
    const target = e.target as HTMLElement;
    const action = target.dataset.action;
    const id = target.dataset.id;
    if (!action || !id || !action.startsWith('delete-')) return;
    const type = action.split('-')[1];
    const docRef = doc(db, 'users', user.uid, `${type}s`, id);
    await deleteDoc(docRef);
};
async function handleAddUrna (e: SubmitEvent) {
    e.preventDefault();
    const user = auth.currentUser; if (!user) return;
    const form = e.target as HTMLFormElement;
    if (form.dataset.action !== 'add-urna') return;
    const locationId = form.dataset.id;
    const input = form.querySelector('input') as HTMLInputElement;
    const urnaValue = parseInt(input.value, 10);
    if (locationId && !isNaN(urnaValue)) {
        const docRef = doc(db, 'users', user.uid, 'locations', locationId);
        await updateDoc(docRef, { urnas: arrayUnion(urnaValue) });
        input.value = '';
    }
};

// --- VOTER MODAL LOGIC ---
function populateSelect (selectElement: HTMLSelectElement, data: AdminItem[], valueField: keyof AdminItem, textField: keyof AdminItem) {
    selectElement.innerHTML = '<option value="">Selecione...</option>';
    data.sort((a,b) => String(a[textField]).localeCompare(String(b[textField]))).forEach(item => {
        const option = document.createElement('option');
        option.value = String(item[valueField] ?? '');
        option.textContent = String(item[textField] ?? '');
        selectElement.appendChild(option);
    });
};
function updateUrnasDropdown (locationName: string, selectedUrna: string | number | null) {
    const selectedLocation = locationsData.find(loc => loc.name === locationName);
    DOMElements.voterUrnaSelect.innerHTML = '<option value="">Selecione...</option>';
    if (selectedLocation?.urnas) {
        selectedLocation.urnas.sort((a:number,b:number)=>a-b).forEach((urna: number) => {
            const option = document.createElement('option');
            option.value = String(urna);
            option.textContent = String(urna);
            if (selectedUrna && urna == selectedUrna) { option.selected = true; }
            DOMElements.voterUrnaSelect.appendChild(option);
        });
    }
};
function showVoterModal(voter: Voter | null) {
    DOMElements.voterError.textContent = '';
    const form = DOMElements.voterForm;
    const elements = form.elements;

    populateSelect(elements.namedItem('voterApoiador') as HTMLSelectElement, leadersData, 'name', 'name');
    populateSelect(elements.namedItem('voterLocal') as HTMLSelectElement, locationsData, 'name', 'name');
    
    if (voter) {
        DOMElements.voterModalTitle.textContent = "Editar Dados do Eleitor";
        (elements.namedItem('voterId') as HTMLInputElement).value = voter.id;
        (elements.namedItem('voterNome') as HTMLInputElement).value = voter.nome || '';
        (elements.namedItem('voterEmail') as HTMLInputElement).value = voter.email || '';
        (elements.namedItem('voterTelefone') as HTMLInputElement).value = voter.telefone || '';
        (elements.namedItem('voterWhatsapp') as HTMLInputElement).checked = voter.isWhatsapp || false;
        (elements.namedItem('voterNumero') as HTMLInputElement).value = String(voter.numero || '');
        (elements.namedItem('voterCnf') as HTMLInputElement).value = voter.cnf || '';
        (elements.namedItem('voterTitulo') as HTMLInputElement).value = voter.tituloEleitor || '';
        (elements.namedItem('voterApoiador') as HTMLSelectElement).value = voter.apoiador || '';
        (elements.namedItem('voterRedes') as HTMLInputElement).value = voter.redesSociais || '';
        (elements.namedItem('voterPartido') as HTMLInputElement).value = voter.partido || '';
        (elements.namedItem('voterFiliacao') as HTMLInputElement).value = voter.dataFiliacao || '';
        (elements.namedItem('voterCep') as HTMLInputElement).value = voter.endereco?.cep || '';
        (elements.namedItem('voterLogradouro') as HTMLInputElement).value = voter.endereco?.logradouro || '';
        (elements.namedItem('voterNumeroEndereco') as HTMLInputElement).value = voter.endereco?.numero || '';
        (elements.namedItem('voterComplemento') as HTMLInputElement).value = voter.endereco?.complemento || '';
        (elements.namedItem('voterLocal') as HTMLSelectElement).value = voter.localVotacao || '';
        DOMElements.voterPhotoPreview.src = voter.photoURL || 'https://placehold.co/150x150/e2e8f0/e2e8f0?text=Foto';
        updateUrnasDropdown(voter.localVotacao || '', voter.urna);
    } else {
        DOMElements.voterModalTitle.textContent = "Cadastrar Novo Eleitor";
        form.reset();
        (elements.namedItem('voterId') as HTMLInputElement).value = '';
        DOMElements.voterPhotoPreview.src = 'https://placehold.co/150x150/e2e8f0/e2e8f0?text=Foto';
        updateUrnasDropdown('', null);
    }
    openModal(DOMElements.voterModal, DOMElements.voterModalBackdrop);
};
async function handleVoterFormSubmit(e: SubmitEvent) {
    e.preventDefault();
    const user = auth.currentUser; if (!user) return;
    DOMElements.voterError.textContent = '';
    const form = DOMElements.voterForm;
    const elements = form.elements;
    const id = (elements.namedItem('voterId') as HTMLInputElement).value;
    const cnf = (elements.namedItem('voterCnf') as HTMLInputElement).value.trim();
    const nome = (elements.namedItem('voterNome') as HTMLInputElement).value.trim();
    if (!nome) { DOMElements.voterError.textContent = "O campo Nome Completo é obrigatório."; return; }
    
    const existingVoter = id ? votersData.find(v => v.id === id) : null;
    let photoURL = existingVoter?.photoURL || '';
    const currentPreviewSrc = DOMElements.voterPhotoPreview.src;
    if (currentPreviewSrc.startsWith('data:image')) { photoURL = currentPreviewSrc; }

    const voterData: Omit<Voter, 'id'> = {
        nome, cnf,
        email: (elements.namedItem('voterEmail') as HTMLInputElement).value, 
        telefone: (elements.namedItem('voterTelefone') as HTMLInputElement).value, 
        isWhatsapp: (elements.namedItem('voterWhatsapp') as HTMLInputElement).checked,
        tituloEleitor: (elements.namedItem('voterTitulo') as HTMLInputElement).value, 
        redesSociais: (elements.namedItem('voterRedes') as HTMLInputElement).value, 
        partido: (elements.namedItem('voterPartido') as HTMLInputElement).value,
        dataFiliacao: (elements.namedItem('voterFiliacao') as HTMLInputElement).value,
        endereco: { 
            cep: (elements.namedItem('voterCep') as HTMLInputElement).value, 
            logradouro: (elements.namedItem('voterLogradouro') as HTMLInputElement).value, 
            numero: (elements.namedItem('voterNumeroEndereco') as HTMLInputElement).value, 
            complemento: (elements.namedItem('voterComplemento') as HTMLInputElement).value 
        },
        numero: parseInt((elements.namedItem('voterNumero') as HTMLInputElement).value, 10) || undefined, 
        apoiador: (elements.namedItem('voterApoiador') as HTMLSelectElement).value,
        localVotacao: (elements.namedItem('voterLocal') as HTMLSelectElement).value, 
        urna: (elements.namedItem('voterUrna') as HTMLSelectElement).value, 
        photoURL,
        assinou: existingVoter?.assinou || false,
    };
    const votersCollectionRef = collection(db, 'users', user.uid, 'voters');
    const docId = id || cnf || doc(votersCollectionRef).id;
    const docRef = doc(votersCollectionRef, docId);
    await setDoc(docRef, voterData, { merge: true });

    closeModal(DOMElements.voterModal, DOMElements.voterModalBackdrop);
};
function setupCepLookup() { DOMElements.voterCepInput.addEventListener('blur', async (e) => { const target = e.target as HTMLInputElement; const cep = target.value.replace(/\D/g, ''); if (cep.length === 8) { try { const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`); if (!response.ok) throw new Error('CEP não encontrado'); const data = await response.json(); if (!data.erro) { DOMElements.voterLogradouroInput.value = `${data.logradouro}, ${data.bairro} - ${data.localidade}/${data.uf}`; } } catch (error) { console.error("Erro ao buscar CEP:", error); } } }); };

// --- FILE PROCESSING & GEMINI ---
function imageToBase64(file: File, includePrefix = false): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => { const dataUrl = reader.result; if (typeof dataUrl === 'string') { if (includePrefix) { resolve(dataUrl); } else { const parts = dataUrl.split(','); resolve(parts.length > 1 ? parts[1] : ''); } } else { reject(new Error("FileReader result is not a string.")); } }; reader.onerror = error => reject(error); }); };
async function extractDataFromImage(base64ImageData: string): Promise<ExtractedData> { const textPart = { text: "Analise a imagem desta lista de votação. Extraia o LOCAL DE VOTAÇÃO e o número da URNA do cabeçalho. Depois, extraia as informações de cada eleitor (numero, nome, cnf, assinou). Se houver uma assinatura, 'assinou' é true. Retorne um objeto JSON com a estrutura: { localVotacao: string, urna: string, eleitores: [{ numero: string, nome: string, cnf: string, assinou: boolean }] }." }; const imagePart = { inlineData: { mimeType: "image/jpeg", data: base64ImageData } }; const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [textPart, imagePart] }, config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { localVotacao: { type: Type.STRING }, urna: { type: Type.STRING }, eleitores: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { numero: { type: Type.STRING }, nome: { type: Type.STRING }, cnf: { type: Type.STRING }, assinou: { type: Type.BOOLEAN } }, required: ["nome", "cnf", "assinou"] } } }, required: ["eleitores"] } } }); const result = await response; const data = JSON.parse(result.text) as ExtractedData; if (!data || !Array.isArray(data.eleitores)) { throw new Error("Formato de resposta da API inválido."); } return data; };
async function handleFileSelect(event: Event) {
    const user = auth.currentUser; if (!user) return;
    const target = event.target as HTMLInputElement;
    const files = Array.from(target.files || []);
    if (files.length === 0) return;

    const startTime = performance.now();
    DOMElements.uploadContainer.innerHTML = `<div class="flex items-center justify-center p-2"><div class="loader"></div><span class="ml-3 text-gray-600 dark:text-gray-400">Calculando...</span></div>`;
    DOMElements.uploadStatus.textContent = '';
    
    let totalItemsToProcess = 0;
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js`;

    for(const file of files) { if (file.type === 'application/pdf') { try { const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise; totalItemsToProcess += pdf.numPages; } catch (e) { console.error(`Erro ao carregar PDF ${file.name}:`, e); } } else { totalItemsToProcess++; } }
    if (totalItemsToProcess === 0) { DOMElements.uploadStatus.innerHTML = `<i class="fas fa-exclamation-circle text-yellow-500 mr-2"></i>Nenhum item válido para processamento.`; return; }

    let processedItems = 0;
    let importedVotersCount = 0;
    let errors: string[] = [];

    const batch = writeBatch(db);
    const votersCollectionRef = collection(db, 'users', user.uid, 'voters');

    for (const file of files) {
        let base64Images: string[] = []; let pageNumber = 0;
        const updateStatus = () => { DOMElements.uploadStatus.textContent = `Processando item ${processedItems} de ${totalItemsToProcess}... (${file.name}${pageNumber > 0 ? ` - Pág ${pageNumber}`: ''}) - ${importedVotersCount} eleitores importados`; }
        if (file.type === 'application/pdf') { try { const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise; for (let i = 1; i <= pdf.numPages; i++) { processedItems++; pageNumber = i; updateStatus(); try { const page = await pdf.getPage(i); const viewport = page.getViewport({ scale: 1.5 }); const canvas = document.createElement('canvas'); canvas.height = viewport.height; canvas.width = viewport.width; const context = canvas.getContext('2d'); if (context) { await page.render({ canvasContext: context, viewport: viewport }).promise; base64Images.push(canvas.toDataURL('image/jpeg').split(',')[1]); } else { throw new Error("Canvas context is not available"); } } catch(e: any) { errors.push(`${file.name} (Pág ${i}): ${e.message}`); } } } catch(e: any) { errors.push(`${file.name} (Erro geral do PDF): ${e.message}`); }
        } else { processedItems++; updateStatus(); try { base64Images.push(await imageToBase64(file)); } catch(e: any) { errors.push(`${file.name}: ${e.message}`); } }
        
        for (const base64Image of base64Images) {
            try {
                const extractedData = await extractDataFromImage(base64Image);
                if (!extractedData?.eleitores) throw new Error("A API não retornou os dados dos eleitores no formato esperado.");
                
                extractedData.eleitores.forEach(voter => {
                    const numeroAsInt = voter.numero ? parseInt(voter.numero, 10) : NaN;
                    const newVoter = {
                        ...voter,
                        localVotacao: extractedData.localVotacao || 'Não identificado',
                        urna: extractedData.urna || 'Não identificada',
                        numero: !isNaN(numeroAsInt) ? numeroAsInt : undefined,
                    };
                    const docId = newVoter.cnf || doc(votersCollectionRef).id; // Use CNF as ID if available
                    const docRef = doc(votersCollectionRef, docId);
                    batch.set(docRef, newVoter, { merge: true });
                    importedVotersCount++;
                });
                updateStatus();
            } catch(e: any) { errors.push(`${file.name}: ${e.message}`); }
        }
    }
    
    await batch.commit();

    const endTime = performance.now();
    const durationInSeconds = (endTime - startTime) / 1000;
    const speed = durationInSeconds > 0 ? (importedVotersCount / durationInSeconds).toFixed(1) : 0;

    if (errors.length > 0) { DOMElements.uploadStatus.innerHTML = `<div class="text-red-500"><i class="fas fa-times-circle mr-2"></i>Processamento concluído com ${errors.length} erro(s).</div>`; showAiModal('Erros no Processamento', `<p>Alguns itens não puderam ser processados:</p><ul class="list-disc pl-5 mt-2">${errors.map(e => `<li>${e}</li>`).join('')}</ul>`); } else { DOMElements.uploadStatus.innerHTML = `<i class="fas fa-check-circle text-green-500 mr-2"></i>${totalItemsToProcess} item(ns) processado(s) com sucesso! ${importedVotersCount} eleitores importados. (Velocidade: ${speed} eleitores/seg)`; }
    
    DOMElements.uploadContainer.innerHTML = `<div class="upload-btn-wrapper"><button class="btn btn-secondary w-full"><i class="fas fa-upload mr-2"></i>Processar Outra Lista</button><input type="file" id="fileUpload" name="myfile" accept="image/*,.pdf" multiple /></div>`;
    const newUploadInput = document.getElementById('fileUpload'); if(newUploadInput) newUploadInput.addEventListener('change', handleFileSelect);
};

// --- AI FEATURES, EXPORT & CHANGELOG ---
function showAiModal(title: string, content: string, isHtml = true) { DOMElements.aiModalTitle.textContent = title; if (isHtml) { DOMElements.aiModalBody.innerHTML = content; } else { DOMElements.aiModalBody.textContent = content; } openModal(DOMElements.aiModal, DOMElements.aiModalBackdrop); };
async function handleGenerateReport() {
    const dataForReport = currentFilteredData;
    if (dataForReport.length === 0) {
        showAiModal('Aviso', '<p>Não há dados (ou dados filtrados) para gerar um relatório.</p>');
        return;
    }
    showAiModal('Gerando Relatório...', '<div class="flex justify-center items-center"><div class="loader"></div></div>');

    // Pre-calculate stats to avoid sending large/complex objects to the AI,
    // which fixes the "circular structure" error and is more efficient.
    const total = dataForReport.length;
    const attended = dataForReport.filter(v => v.assinou).length;
    const absent = total - attended;
    const attendanceRate = total > 0 ? ((attended / total) * 100).toFixed(2) : '0.00';

    const prompt = `Gere um relatório de comparecimento em HTML simples (use <h2> para o título, <p> e <strong>). O relatório deve incluir:
1. Um título claro, como "Relatório de Comparecimento".
2. O número total de eleitores: ${total}.
3. O número de eleitores que compareceram: ${attended}.
4. O número de ausentes: ${absent}.
5. A taxa de comparecimento: ${attendanceRate}%.
6. Um parágrafo curto com uma análise qualitativa sobre o resultado (por exemplo, se o comparecimento foi alto, baixo, ou mediano e o que isso pode significar).`;

    try {
        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        showAiModal('Relatório de Comparecimento', response.text);
    } catch (error: any) {
        console.error("Erro ao gerar relatório:", error);
        showAiModal('Erro', `<p>Não foi possível gerar o relatório. Tente novamente.</p><p class="text-xs text-red-400 mt-2">${error.message}</p>`);
    }
}
function handleDraftMessage() { const dataForMessage = currentFilteredData; if (dataForMessage.length === 0) { showAiModal('Aviso', '<p>Não há dados (ou dados filtrados) para gerar uma mensagem.</p>'); return; } const content = `<p class="mb-4">Para qual público você deseja criar a mensagem?</p><div class="flex flex-col gap-3"><button id="msgAttendeesBtn" class="btn btn-secondary w-full">Agradecer Comparecimento</button><button id="msgAbsenteesBtn" class="btn btn-secondary w-full">Engajar Ausentes</button></div>`; showAiModal('Criar Rascunho de Comunicação', content); document.getElementById('msgAttendeesBtn')!.onclick = () => generateMessagePrompt('attendees'); document.getElementById('msgAbsenteesBtn')!.onclick = () => generateMessagePrompt('absentees'); };
async function generateMessagePrompt(type: 'attendees' | 'absentees') { showAiModal('Criando Rascunho...', '<div class="flex justify-center items-center"><div class="loader"></div></div>'); const attendeesCount = currentFilteredData.filter(v => v.assinou).length; const absenteesCount = currentFilteredData.filter(v => !v.assinou).length; const prompt = type === 'attendees' ? `Você é um organizador de uma eleição interna do PT. Escreva uma mensagem de SMS curta (até 160 caracteres), amigável e inspiradora para agradecer aos ${attendeesCount} membros que compareceram para votar no PED 2025. Mencione a importância da participação deles para a democracia interna do partido.` : `Você é um organizador de uma eleição interna do PT. Escreva uma mensagem de SMS curta (até 160 caracteres), amigável e respeitosa para os ${absenteesCount} membros que não puderam comparecer à votação do PED 2025. Lembre-os da importância de sua voz e incentive a participação em futuros eventos do partido.`; try { const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt }); const draftText = response.text; const modalContent = `<p class="mb-4">Aqui está um rascunho gerado pela IA:</p><textarea readonly class="w-full h-32 p-2 border rounded bg-gray-50 dark:bg-gray-700 dark:text-gray-300">${draftText}</textarea><p class="text-xs text-gray-500 mt-2">Você pode copiar o texto acima.</p>`; showAiModal(`Rascunho para ${type === 'attendees' ? 'Presentes' : 'Ausentes'}`, modalContent); } catch (error: any) { console.error("Erro ao gerar rascunho:", error); showAiModal('Erro', `<p>Não foi possível gerar o rascunho. Tente novamente.</p><p class="text-xs text-red-400 mt-2">${error.message}</p>`); } };
async function handleExport(type: 'xlsx' | 'csv') { if (selectedVoterIds.size === 0) { alert("Nenhum eleitor selecionado. Por favor, selecione as linhas que deseja exportar."); return; } const dataToExport = votersData.filter(v => selectedVoterIds.has(v.id)).map(({ id, photoURL, ...rest }) => rest); const estimatedTimeInSeconds = Math.max(1, Math.round(dataToExport.length / 1000)); showAiModal('Exportando Dados', `<div class="flex flex-col items-center justify-center text-center"><div class="loader mb-4"></div><p>Preparando a exportação de ${dataToExport.length} registros selecionados.</p><p class="mt-2">O download começará em aproximadamente <span id="export-timer" class="font-bold">${estimatedTimeInSeconds}</span> segundos.</p></div>`); let timeLeft = estimatedTimeInSeconds; const timerInterval = setInterval(() => { timeLeft--; const timerElement = document.getElementById('export-timer'); if (timerElement) timerElement.textContent = String(Math.max(0, timeLeft)); if (timeLeft <= 0) clearInterval(timerInterval); }, 1000); await new Promise(resolve => setTimeout(resolve, 100)); try { if (type === 'xlsx') { const worksheet = XLSX.utils.json_to_sheet(dataToExport); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Eleitores"); XLSX.writeFile(workbook, "eleitores_selecionados.xlsx"); } clearInterval(timerInterval); showAiModal('Exportação Concluída', `<div class="flex flex-col items-center justify-center text-center"><i class="fas fa-check-circle text-green-500 text-4xl mb-4"></i><p>O arquivo foi gerado com sucesso!</p></div>`); } catch (error) { clearInterval(timerInterval); console.error("Erro na exportação:", error); showAiModal('Erro na Exportação', `<div class="flex flex-col items-center justify-center text-center"><i class="fas fa-times-circle text-red-500 text-4xl mb-4"></i><p>Ocorreu um erro ao gerar o arquivo.</p></div>`); } finally { setTimeout(() => closeModal(DOMElements.aiModal, DOMElements.aiModalBackdrop), 3000); } };
function renderChangelog() { DOMElements.changelogModalBody.innerHTML = changelog.map(entry => `<div class="mb-4"><h3 class="text-lg font-bold">Versão ${entry.version} <span class="text-sm font-normal text-gray-500 dark:text-gray-400">- ${entry.date}</span></h3><ul class="list-disc pl-5 mt-2 space-y-1">${entry.changes.map(change => `<li>${change.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li>`).join('')}</ul></div>`).join('<hr class="my-4 border-gray-200 dark:border-gray-600">'); };

// --- INITIALIZATION & EVENT LISTENERS ---
const init = () => {
    // Basic Auth & Layout
    DOMElements.loginBtn.addEventListener('click', handleLogin);
    DOMElements.logoutBtn.addEventListener('click', () => signOut(auth));
    
    // Appearance
    const savedMode = localStorage.getItem('displayMode') || 'light';
    const savedTheme = localStorage.getItem('colorTheme') || 'theme-default';
    renderThemeOptions();
    applyAppearance(savedMode, savedTheme);
    DOMElements.appearanceBtn.addEventListener('click', () => openModal(DOMElements.appearanceModal, DOMElements.appearanceModalBackdrop));
    [DOMElements.closeAppearanceModalBtn, DOMElements.appearanceModalBackdrop].forEach(el => el.addEventListener('click', () => closeModal(DOMElements.appearanceModal, DOMElements.appearanceModalBackdrop)));
    DOMElements.lightModeBtn.addEventListener('click', () => applyAppearance('light', localStorage.getItem('colorTheme') || 'theme-default'));
    DOMElements.darkModeBtn.addEventListener('click', () => applyAppearance('dark', localStorage.getItem('colorTheme') || 'theme-default'));
    DOMElements.themeGrid.addEventListener('click', (e) => {
        const swatch = (e.target as HTMLElement).closest('.theme-swatch') as HTMLElement;
        if (swatch) {
            const theme = swatch.dataset.theme;
            if (theme) applyAppearance(localStorage.getItem('displayMode') || 'light', theme);
        }
    });

    DOMElements.dashboardVersionLink.textContent = `Versão ${APP_VERSION}`;
    
    // Modals
    DOMElements.openAdminBtn.addEventListener('click', () => openModal(DOMElements.adminModal, DOMElements.adminModalBackdrop));
    [DOMElements.closeAdminModalBtn, DOMElements.adminModalBackdrop].forEach(el => el.addEventListener('click', () => closeModal(DOMElements.adminModal, DOMElements.adminModalBackdrop)));
    DOMElements.addVoterBtn.addEventListener('click', () => showVoterModal(null));
    [DOMElements.closeVoterModalBtn, DOMElements.voterModalBackdrop].forEach(el => el.addEventListener('click', () => closeModal(DOMElements.voterModal, DOMElements.voterModalBackdrop)));
    [DOMElements.closeAiModalBtn, DOMElements.aiModalBackdrop].forEach(el => el.addEventListener('click', () => closeModal(DOMElements.aiModal, DOMElements.aiModalBackdrop)));
    DOMElements.dashboardVersionLink.addEventListener('click', () => { renderChangelog(); openModal(DOMElements.changelogModal, DOMElements.changelogModalBackdrop); });
    [DOMElements.closeChangelogModalBtn, DOMElements.changelogModalBackdrop].forEach(el => el.addEventListener('click', () => closeModal(DOMElements.changelogModal, DOMElements.changelogModalBackdrop)));
    
    // Table, Filter, Sort & Data
    DOMElements.searchInput.addEventListener('input', applyFiltersAndSort);
    DOMElements.selectAllCheckbox.addEventListener('change', handleSelectAll);
    DOMElements.tableHeader.addEventListener('click', (e) => {
        const filterButton = (e.target as HTMLElement).closest('.filter-btn') as HTMLElement;
        if (filterButton) {
            const columnKey = (filterButton.parentElement as HTMLElement).dataset.column;
            if (columnKey) renderFilterDropdown(columnKey, filterButton);
        }
    });
    DOMElements.votersTableBody.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('voter-checkbox')) {
            const voterId = (target as HTMLInputElement).dataset.id;
            if (voterId) { if ((target as HTMLInputElement).checked) selectedVoterIds.add(voterId); else selectedVoterIds.delete(voterId); }
            updateSelectAllCheckboxState();
        } else {
            const button = target.closest('.btn-edit');
            if (button) {
                const voter = votersData.find(v => v.id === (button as HTMLElement).dataset.id);
                if (voter) showVoterModal(voter);
            }
        }
    });
    
    // Pagination
    DOMElements.paginationControls.addEventListener('click', (e) => { const button = (e.target as HTMLElement).closest('.pagination-btn') as HTMLButtonElement; if (button && !button.hasAttribute('disabled')) { const page = parseInt(button.dataset.page as string, 10); if(!isNaN(page)) { currentPage = page; renderTable(); } } });

    // Voter Form
    DOMElements.voterForm.addEventListener('submit', handleVoterFormSubmit);
    DOMElements.chooseFileBtn.addEventListener('click', () => DOMElements.voterPhotoInput.click());
    DOMElements.voterPhotoInput.addEventListener('change', async (e) => { const target = e.target as HTMLInputElement; const file = target.files?.[0]; if (file) { DOMElements.voterPhotoPreview.src = await imageToBase64(file, true); } });
    DOMElements.voterLocalSelect.addEventListener('change', (e) => updateUrnasDropdown((e.target as HTMLSelectElement).value, null));
    setupCepLookup();
    
    // Admin Panel
    DOMElements.locationForm.addEventListener('submit', (e) => handleAdminFormSubmit(e, 'location'));
    DOMElements.leaderForm.addEventListener('submit', (e) => handleAdminFormSubmit(e, 'leader'));
    DOMElements.electionForm.addEventListener('submit', (e) => handleAdminFormSubmit(e, 'election'));
    DOMElements.adminModalBody.addEventListener('click', handleAdminAction);
    DOMElements.adminModalBody.addEventListener('submit', handleAddUrna);

    // Main Controls
    const fileUploadInput = document.getElementById('fileUpload'); if (fileUploadInput) fileUploadInput.addEventListener('change', handleFileSelect);
    DOMElements.generateReportBtn.addEventListener('click', handleGenerateReport);
    DOMElements.draftMessageBtn.addEventListener('click', handleDraftMessage);
    DOMElements.exportXLSXBtn.addEventListener('click', (e) => { e.preventDefault(); handleExport('xlsx'); });

    applyFiltersAndSort();
};

// --- STARTUP ---
document.addEventListener('DOMContentLoaded', init);