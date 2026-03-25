# PlanPulse - Synthese des ecrans

> Planification dynamique de production - DAG temps reel

## Architecture globale

```
┌─────────────────────────────────────────────────────────────┐
│  Sidebar (60px)  │              Vue active                  │
│                  │                                          │
│  ● Pulse         │  ┌──────────────────────────────────┐   │
│  ● Gantt         │  │                                  │   │
│  ● Graphe        │  │     Contenu de la vue            │   │
│  ● Heatmap       │  │                                  │   │
│  ● Scenarios     │  └──────────────────────────────────┘   │
│                  │                         ┌──────────────┐ │
│  v0.1            │                         │ Tiroir detail│ │
│                  │                         │ (400px)      │ │
└──────────────────┴─────────────────────────┴──────────────┘
```

Toutes les vues partagent le meme **graphStore** (432 noeuds, 1116 aretes synchronises par WebSocket) et le meme **uiStore** (selection, filtres). La selection d'un noeud est persistante entre vues.

---

## 1. Pulse (Tableau de bord) — `/`

### Vocation metier

Le poste de commandement du planificateur. Un coup d'oeil suffit pour identifier l'etat de sante du plan : combien d'OF sont actifs, lesquels sont en tension, quels achats posent probleme.

### Zones

| Zone | Contenu | Donnees |
|---|---|---|
| **KPI (haut)** | 4 cartes : OF actifs, En retard, Tension %, Couverture achats % | `GET /kpi` (refresh 30s) |
| **Table critique (2/3)** | Top 15 OF par marge la plus faible. Colonnes : ID, Article, Debut, Fin, Statut, Marge | `GET /graph` (noeuds + marges) |
| **Fil alertes (1/3)** | Liste scrollable des achats en retard et obsoletes, avec badges severite WARNING/CRITICAL | `GET /achat/alertes` |
| **Barre resume (bas)** | Total OF, Achats, Aretes dans le graphe | `graphStore.kpis` |

### Interactions

- Clic sur une ligne de la table → ouvre le tiroir de detail
- Seuils de couleur automatiques (vert/ambre/rouge) sur les KPI et les marges
- Lecture seule — pas d'edition depuis cette vue

---

## 2. Gantt augmente — `/gantt`

### Vocation metier

La vue centrale de travail. Le planificateur y reorganise le plan en deplacant les barres d'OF et voit instantanement l'impact en cascade sur toute la chaine. C'est ici que se prennent les decisions de replanification.

### Structure visuelle

```
┌──────────┬──────────────────────────────────────────┐
│ Toolbar  │ [1s][2s][4s][6s]  Filtre statut  [Crit] │
├──────────┼──────────────────────────────────────────┤
│ OF-1001  │ ████████████ (vert, float > 5j)         │
│  OF-2001 │    ███████ (ambre, float 3j)            │
│  OF-2002 │      █████ (rouge, float 0j) ← critique │
│  OF-2003 │    ████████                              │
│ OF-1002  │        ██████████████                    │
│  ...     │ Ligne rouge "Aujourd'hui" |              │
└──────────┴──────────────────────────────────────────┘
```

### Composants

| Composant | Role |
|---|---|
| **GanttToolbar** | Zoom (1/2/4/6 semaines), filtre statut (Select), toggle chemin critique |
| **GanttChart** | SVG avec axe X temps (jours/semaines), axe Y hierarchique (OF parent → sous-OF indentes) |
| **GanttBar** | Barre individuelle : couleur par marge, bordure critique (rouge), selection (bleu) |
| **MoveConfirmDialog** | Dialog de confirmation apres drag : resume du delta, liste des OF impactes |

### Couleurs des barres

| Couleur | Condition | Signification |
|---|---|---|
| **Vert** (`--pp-green`) | marge > 5 jours | Tout va bien |
| **Ambre** (`--pp-amber`) | marge 2-5 jours | Vigilance |
| **Corail** (`--pp-coral`) | marge 0-1 jour | Tension |
| **Rouge** (`--pp-red`) | marge negative ou EN_RETARD | Critique |

### Drag-and-drop (le differenciateur)

1. L'utilisateur saisit une barre et la deplace horizontalement
2. Toutes les 100ms, le client envoie `of:move-preview` via WebSocket (avec `requestId` incremental)
3. Le serveur calcule la propagation en < 50ms et retourne les noeuds impactes
4. Les barres impactees apparaissent a 50% d'opacite a leurs nouvelles positions
5. Au relachement : dialog de confirmation avec le delta et la liste des impacts
6. **Confirmer** → `of:move-commit` → persistance en BDD + broadcast a tous les clients
7. **Annuler** → retour a l'etat initial

### Garde-fous

- Drag desactive si WebSocket deconnecte
- Reponses avec `requestId` obsolete ignorees (pas de saut d'UI)
- Lignes de dependances courbes visibles pour l'OF selectionne

---

## 3. Graphe de dependances — `/graph`

### Vocation metier

Comprendre la topologie du plan. Voir pourquoi un OF est bloque (remonter les causes) ou evaluer l'etendue d'un retard (zone d'impact). Essentiel pour diagnostiquer les problemes structurels du plan.

### Visualisation (@xyflow/react)

| Element | Apparence |
|---|---|
| **Noeud OF** | Rectangle blanc, bordure gauche coloree par marge, affiche ID + article + dates + statut |
| **Noeud Achat** | Rectangle violet (#F3EEFF) avec indicateur losange |
| **Arete FORT/NOMENCLATURE** | Trait plein gris, anime si chemin critique |
| **Arete PARTAGE** | Pointille gris |
| **Noeud critique** | Bordure rouge complete (2px) |
| **Noeud selectionne** | Halo bleu |

### Layout

Algorithme BFS maison : les noeuds sans predecesseurs sont a gauche (profondeur 0), chaque niveau de dependance decale de 280px vers la droite.

### Toolbar

| Bouton | Effet |
|---|---|
| **Zone d'impact** | Surbrillance de tous les descendants du noeud selectionne, reste a 25% d'opacite |
| **Remonter les causes** | Surbrillance de tous les ancetres |
| **Recentrer** | Fit view sur l'ensemble du graphe |

### Interactions

- Clic noeud → selection + tiroir detail
- Clic fond → deselection
- Zoom/pan natif + minimap en bas a droite (coloree : rouge = critique, violet = achat, bleu = OF)

---

## 4. Heatmap de risque — `/heatmap`

### Vocation metier

Vue strategique a 6 semaines. Le planificateur identifie d'un coup d'oeil les zones de tension dans le temps (quand) et par dimension (quel client, quelle priorite). Permet d'anticiper les goulots avant qu'ils ne deviennent des retards.

### Grille SVG

```
              S13    S14    S15    S16    S17    S18
ART-PF-001   🟢     🟡     🟠     🔴     🟡     🟢
ART-SF-001   🟢     🟢     🟡     🟡     🟢     ⬜
ART-SF-002   🟡     🟠     🔴     🟠     🟡     🟢
```

### Controles

| Selecteur | Options |
|---|---|
| **Periode** | Par semaine (6 colonnes) / Par jour (42 colonnes) |
| **Grouper par** | Par article / Par priorite (P1-P5) / Par statut |

### Encodage visuel

- **Couleur** : marge moyenne des OF dans la cellule (vert > 5j, ambre 2-5j, corail 0-1j, rouge < 0j)
- **Opacite** : proportionnelle au nombre d'OF (0.3 a 1.0) — plus c'est opaque, plus il y a d'OF
- **Tooltip** : nom du groupe, periode, nombre d'OF, marge moyenne, liste des 10 premiers OF avec leur marge

---

## 5. Scenarios What-If — `/scenarios`

### Vocation metier

Simuler des modifications du plan (decaler un OF, ajouter une commande, changer une priorite) sans affecter le plan reel. Comparer le scenario avec l'etat actuel.

### Etat actuel

Placeholder avec :

- Icone Flask + texte explicatif en francais
- Bouton "Nouveau scenario" → toast "Fonctionnalite bientot disponible"

Le backend `whatif/` est prevu dans l'architecture (table `Scenario` avec snapshot JSON) mais le wiring complet n'est pas encore fait.

---

## 6. Tiroir de detail (composant global)

### Vocation metier

Information contextuelle detaillee sans quitter la vue en cours. Le planificateur clique sur n'importe quel noeud depuis n'importe quelle vue et voit tout : dates, marges, dependances amont/aval, sous-OF, statut.

### Contenu pour un OF

| Section | Information |
|---|---|
| **Header** | ID, article, statut (badge), priorite (P1-P5), badge critique |
| **Dates** | Debut prevu, Fin prevue, Marge totale (coloree), Marge libre |
| **Amont** | Liste des predecesseurs (cliquables pour naviguer) |
| **Aval** | Liste des successeurs (cliquables) |
| **Sous-OF** | Sous-assemblages avec leur statut |

### Contenu pour un Achat

| Section | Information |
|---|---|
| **Header** | ID, article, fournisseur, statut, badge "Achat" violet |
| **Dates** | Commande, Livraison prevue, Livraison reelle |
| **Dependances** | OF lies en amont/aval |

### Navigation

Clic sur un noeud dans la liste de dependances → le tiroir navigue vers ce noeud. "Voir dans le graphe" → ferme le tiroir et laisse la vue graphe centrer sur le noeud.

---

## Bandeau de connexion (composant global)

Barre rouge fixe en haut de l'ecran affichant "Connexion perdue, reconnexion en cours..." quand le WebSocket est deconnecte. Le drag-and-drop est desactive pendant la deconnexion.

---

## Flux de donnees

```
PostgreSQL (432 noeuds, 1116 aretes)
    │
    ▼ loadFromDb() au demarrage (108ms)
GraphService (DAG en memoire)
    │
    ├── GET /graph ──────────────► graphStore (Zustand)
    │                                   │
    ├── WS of:move-preview ◄────► Gantt drag (100ms throttle)
    │                                   │
    ├── WS of:move-commit ──────► Broadcast graph:updated
    │                                   │
    └── Cron 30s ──────────────► AlertDetectionService
                                        │
                                    WS alert:new ──► toast + fil alertes
```

### Stores Zustand

| Store | Contenu | Sync |
|---|---|---|
| **graphStore** | nodes, edges, margins, criticalPath, kpis, alerts, propagationPreview | Serveur (REST initial + WebSocket deltas) |
| **uiStore** | selectedNodeId, hoveredNodeId, filters, ganttZoom, dragState, activeView, detailDrawerOpen | Client uniquement |

### Endpoints API

| Methode | Endpoint | Usage |
|---|---|---|
| GET | `/graph` | Chargement initial (tout le DAG + marges + chemin critique) |
| GET | `/kpi` | 4 metriques du dashboard (refresh 30s) |
| GET | `/of?page=&statut=` | Liste paginee des OF |
| GET | `/of/:id` | Detail OF avec dependances et sous-OF |
| PATCH | `/of/:id/move` | Deplacement avec propagation (commit) |
| POST | `/of/:id/move-preview` | Preview de propagation (sans persistance) |
| GET | `/achat/alertes` | Achats en anomalie |
| GET | `/nomenclature/:id/explode` | BOM eclatee recursive |
| GET | `/alert` | Alertes actives |
| GET | `/alert/summary` | Compteurs par severite |
| GET | `/graph/impact-zone/:id` | Descendants d'un noeud |
| GET | `/graph/critical-path` | Chemin critique recalcule |

### Evenements WebSocket

| Evenement | Direction | Usage |
|---|---|---|
| `of:move-preview` | Client → Serveur | Drag en cours (avec requestId) |
| `of:move-preview-result` | Serveur → Client | Noeuds impactes (avec requestId) |
| `of:move-commit` | Client → Serveur | Confirmation du deplacement |
| `graph:updated` | Serveur → Tous | Broadcast apres commit |
| `critical-path:changed` | Serveur → Tous | Chemin critique modifie |
| `kpi:updated` | Serveur → Tous | KPI recalcules |
| `alert:new` | Serveur → Tous | Nouvelle alerte detectee |
| `alert:resolved` | Serveur → Tous | Alerte resolue |

---

## Stack technique

| Couche | Technologies |
|---|---|
| **Frontend** | React 19, Vite 7, TanStack Router, TanStack Query, Zustand + Immer |
| **UI** | @fli-dgtf/flow-ui (Base UI), Tailwind CSS 4, Lucide icons |
| **Visualisations** | @xyflow/react (DAG), D3.js scales (Gantt, Heatmap), SVG React |
| **Temps reel** | Socket.IO client |
| **API** | NestJS 11, Prisma 7, Zod + nestjs-zod, Socket.IO server |
| **Moteur DAG** | Graphe en memoire (Map), propagation AC-3, CPM (forward/backward pass) |
| **Detection** | Cron NestJS 30s, 5 types d'alertes |
| **IA** | Python FastAPI, NetworkX, NumPy, SciPy, scikit-learn |
| **Infra** | PostgreSQL 16, Redis 7, Docker Compose |

---

## Donnees du jeu initial (seed)

| Table | Volume |
|---|---|
| Articles | 29 (1 PF, 3 SF, 13 communs, 12 specifiques) |
| Nomenclatures | 28 liens BOM |
| Ordres de fabrication | 240 (60 finaux + 180 sous-OF) |
| Achats | 192 (36 globaux + 156 specifiques) |
| Dependances | 1 116 aretes dans le DAG |
| Alertes detectees | 213 (206 warnings, 7 critiques) |

### Problemes injectes

- 5 achats en retard de livraison
- 2 penuries (roues et controleurs)
- 5 contraintes temporelles violees
- 2 OF orphelins (parent annule)
- 1 achat obsolete
- 1 fournisseur (BatteryWorld) avec 80% de retards
