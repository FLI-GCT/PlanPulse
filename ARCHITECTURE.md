# PlanPulse - Architecture, ecrans et analyse technique

> Document de reference pour comprendre, critiquer et ameliorer le projet.
> Derniere mise a jour : 2 avril 2026

---

## 1. Vision produit

PlanPulse est un outil de planification dynamique de production. Il modelise le plan comme un **graphe oriente acyclique (DAG)** et propage les impacts de chaque changement en temps reel.

Le cas d'usage : un planificateur industriel deplace un ordre de fabrication dans le temps. En moins de 100ms, le systeme lui montre toute la cascade d'impacts : quels OF sont decales, quels achats deviennent critiques, quels jalons clients sont menaces.

Le jeu de donnees simule un fabricant de trottinettes electriques : 60 commandes clients, 240 OF, 192 achats, 1 116 dependances.

---

## 2. Architecture globale

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React 19)                       │
│           Vite 7 · TanStack Router · Zustand · @xyflow/react    │
│                         Port 5173                                │
├──────────────┬──────────────────────────────┬────────────────────┤
│   REST       │    WebSocket (Socket.IO)     │                    │
│   (Axios)    │    (socket.io-client)        │                    │
├──────────────┴──────────────────────────────┴────────────────────┤
│                        API (NestJS 11)                           │
│          Prisma 7 · Zod · Socket.IO · Bull · @nestjs/schedule   │
│                         Port 3001                                │
│                                                                  │
│  Modules :                                                       │
│  ├── graph/         DAG en memoire + propagation + CPM           │
│  ├── of/            CRUD ordres de fabrication                   │
│  ├── achat/         CRUD achats                                  │
│  ├── nomenclature/  Gestion BOM                                  │
│  ├── kpi/           Indicateurs cles                             │
│  ├── alert/         Detection d'anomalies (cron 30s)             │
│  └── ws/            Gateway WebSocket                            │
├──────────────────────────────────────────────────────────────────┤
│                     SERVICE IA (Python)                           │
│              FastAPI · NetworkX · NumPy · SciPy                  │
│                         Port 3002                                │
├──────────────────────────────────────────────────────────────────┤
│                     INFRASTRUCTURE                               │
│              PostgreSQL 16 · Redis 7 · Docker Compose            │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Les ecrans

### 3.1 Pulse (Dashboard) — `/`

**Vocation metier** : Le poste de commandement. Le planificateur ouvre PlanPulse le matin et sait en 3 secondes ou sont les problemes.

**Composition** :

| Zone | Composant | Donnees |
|------|-----------|---------|
| KPI (haut) | `KpiRow` — 4 cartes : OF actifs, En retard, Tension %, Couverture achats % | `GET /kpi` (polling 30s) |
| Table critique (2/3 gauche) | `CriticalOfsTable` — Top 15 OF par marge croissante | `GET /graph` (noeuds + marges) |
| Alertes (1/3 droite) | `AlertsFeed` — Fil scrollable des achats en retard/obsoletes | `GET /achat/alertes` |
| Resume (bas) | `SummaryBar` — Compteurs total OF, achats, aretes | `graphStore.kpis` |

**Interactions** : Clic ligne table → tiroir de detail. Lecture seule, pas d'edition.

**Logique** : Les KPI sont calcules cote serveur (count en BDD). La table critique trie les OF en memoire cote client depuis le graphStore. Les alertes viennent d'un endpoint dedie.

---

### 3.2 Gantt augmente — `/gantt`

**Vocation metier** : La vue de travail. Le planificateur reorganise le plan en drag-and-drop et voit les impacts en cascade instantanement.

**Composition** :

| Composant | Role |
|-----------|------|
| `GanttToolbar` | Zoom (1/2/4/6 sem), filtre statut, toggle chemin critique |
| `GanttChart` | SVG : axe X temps (jours), axe Y hierarchique (parent → sous-OF), barres colorees, lignes de dependances, ligne "Aujourd'hui" |
| `GanttBar` | Barre individuelle : couleur par marge, bordure critique/selection |
| `MoveConfirmDialog` | Confirmation apres drag : delta, OF impactes, confirmer/annuler |

**Couleurs des barres** :
- Vert (`--pp-green`) : marge > 5j — tout va bien
- Ambre (`--pp-amber`) : 2-5j — vigilance
- Corail (`--pp-coral`) : 0-1j — tension
- Rouge (`--pp-red`) : negatif ou EN_RETARD — critique

**Mecanisme de drag** :
1. `mousedown` sur une barre → `uiStore.startDrag({ ofId, requestId })`
2. `mousemove` (throttle 100ms) → emit `of:move-preview` via WebSocket avec `requestId` incremental
3. Le serveur calcule la propagation (< 50ms) et retourne les noeuds impactes
4. Le client filtre par `requestId` (ignore les reponses obsoletes) → barres impactees a 50% opacite
5. `mouseup` → modale de confirmation avec recap
6. "Confirmer" → emit `of:move-commit` → serveur persiste + broadcast `graph:updated`

**Garde-fous** : Drag desactive si WebSocket deconnecte. Reponses avec `requestId` obsolete ignorees.

**Logique technique** : Le chart est du React SVG pur avec `d3.scaleTime()` uniquement pour les echelles. Pas de D3 imperatif. Les barres sont des composants `React.memo`. La hierarchie parent/sous-OF est construite depuis les edges `NOMENCLATURE`.

---

### 3.3 Graphe multi-echelle — `/graph`

**Vocation metier** : Comprendre la topologie du plan. Naviguer entre niveaux semantiques comme Google Earth : vue satellite → ville → rue.

**Principe fondamental** : On ne montre jamais plus de 30 noeuds en detail.

#### Niveau 1 — Vue strategique

| Variante | Visualisation | Interactions |
|----------|--------------|-------------|
| **Bulles** (`BubbleMap`) | D3 force layout. Chaque bulle = un groupe d'OF (par client, semaine, article ou priorite). Taille ∝ nombre d'OF. Couleur = tension moyenne. | Hover = tooltip. Clic = transition vers N2. |
| **Flux** (`FlowView`) | D3 paths horizontaux. Chaque flux = une commande client. Achats partages = rectangles violets croisant les flux. Animation stroke-dashoffset. | Hover = eclairer le flux. Clic = transition vers N2. |

**Donnees** : `GET /graph/strategic?groupBy=client` (15 groupes, 105 liens) et `GET /graph/flows` (60 flux, 36 achats partages).

**Toolbar** : Switch Bulles/Flux + selecteur de groupement (client, semaine, article, priorite).

#### Niveau 2 — Vue commande

Un seul client a la fois : 1 OF final + 3 sous-OF + achats = 15-25 noeuds. Layout **dagre** gauche-droite (achats a gauche, sous-OF au centre, OF final a droite).

| Composant | Role |
|-----------|------|
| `CommandGraph` | @xyflow/react + dagre layout. Noeuds OF (220x90, bordure coloree) et Achat (200x80, fond violet). Aretes custom (fleches, labels quantite). |
| `CommandSidebar` | Liste scrollable des 60 commandes clients avec mini-cartes filtrable par nom. Clic = switch de commande. |
| `DependencyEdge` | Arete custom : trait plein (FORT), pointille (PARTAGE), rouge anime (critique). |

**Donnees** : `GET /graph/subgraph?rootId=OF-1001&depth=3&direction=both` retourne ~19 noeuds.

**Regle d'arret** : Quand on suit un achat partage en direction "descendants", on ne montre QUE les OF du meme client. Sinon un achat de roues (60 consommateurs) explose le sous-graphe.

#### Niveau 3a — Vue focus

Un noeud au centre (280x120px, ombre), voisins 1 saut (220x90px), voisins 2 sauts (160x60px, 60% opacite). Clic sur un voisin = il devient le centre.

#### Niveau 3b — Vue question

Le planificateur pose une question, le systeme montre le sous-graphe de la reponse.

| Question | Type | Ce que ca montre |
|----------|------|------------------|
| "Pourquoi cet OF est en retard ?" | `why-late` | Chaine des ancetres avec le goulot surligne en orange |
| "Qu'est-ce qui en depend ?" | `what-depends` | Descendants avec role cause/victime |
| "Critique cette semaine ?" | `critical-week` | Noeuds du chemin critique de la semaine |
| "Achats en danger ?" | `endangered-purchases` | Achats EN_RETARD + OF impactes |

**Algo "why-late"** : remonte recursivement les predecesseurs (depth max 5), identifie le pire depassement a chaque niveau, marque le goulot.

#### Navigation

**Breadcrumb** : `Vue strategique > Client Durand > OF-1023 (focus)`. Chaque segment cliquable.

**Transitions** : Fade-out D3 (200ms) → fade-in xyflow (300ms) entre N1 et N2. Entre N2 et N3a : layout transition fluide (meme moteur xyflow).

---

### 3.4 Heatmap de risque — `/heatmap`

**Vocation metier** : Vue strategique a 6 semaines. Identifier d'un coup d'oeil les zones de tension par temps x groupement.

**Grille SVG** : Colonnes = semaines ou jours. Lignes = par article, priorite ou statut.

**Encodage** :
- Couleur cellule = marge moyenne (vert > 5j, ambre 2-5j, corail 0-1j, rouge < 0j)
- Opacite = nombre d'OF (0.3 a 1.0)
- Tooltip = detail des OF dans la cellule

**Donnees** : Consomme directement `graphStore.nodes` et `graphStore.margins`.

---

### 3.5 Scenarios What-If — `/scenarios`

**Etat actuel** : Placeholder. Le bouton "Nouveau scenario" affiche un toast. L'infrastructure backend existe (table `Scenario` avec snapshot JSON) mais le wiring n'est pas fait.

---

### 3.6 Tiroir de detail (global)

**Disponible depuis toutes les vues.** Panneau lateral droit (400-440px) qui s'ouvre au clic sur un noeud.

**Pour un OF** : Header (ID, article, statut, priorite, critique), dates + marges colorees, dependances amont/aval (cliquables), sous-OF.

**Pour un achat** : Header (ID, article, fournisseur, statut), dates, dependances.

**Navigation** : Clic sur un noeud dans les listes de dependances → le tiroir navigue vers ce noeud.

---

### 3.7 Bandeau de connexion (global)

Barre rouge fixe "Connexion perdue, reconnexion en cours..." quand le WebSocket est deconnecte. Le drag Gantt est desactive.

---

## 4. Flux de donnees

```
                    ┌─────────────┐
                    │ PostgreSQL  │
                    │ 10 tables   │
                    └──────┬──────┘
                           │ loadFromDb() (89ms)
                    ┌──────▼──────┐
                    │ GraphService│ ← DAG en memoire (432 noeuds, 1116 aretes)
                    │ (singleton) │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
   ┌──────▼──────┐  ┌─────▼─────┐  ┌───────▼───────┐
   │ REST API    │  │ WebSocket │  │ Cron 30s      │
   │ GET /graph  │  │ move-prev │  │ AlertDetection│
   │ GET /kpi    │  │ move-comm │  │ 5 checks      │
   │ etc.        │  │ broadcast │  │               │
   └──────┬──────┘  └─────┬─────┘  └───────┬───────┘
          │                │                │
   ┌──────▼────────────────▼────────────────▼───────┐
   │                    FRONTEND                     │
   │                                                 │
   │  graphStore (Zustand)      uiStore (Zustand)    │
   │  ├─ nodes, edges          ├─ selectedNodeId    │
   │  ├─ margins, criticalPath ├─ filters, zoom     │
   │  ├─ kpis, alerts          ├─ dragState          │
   │  └─ propagationPreview    └─ graphNav (level)   │
   │                                                 │
   │  TanStack Query (cache REST)                    │
   │  ├─ useGraphQuery (staleTime: Infinity)         │
   │  ├─ useKpiQuery (refetchInterval: 30s)          │
   │  ├─ useSubgraphQuery (par commande)             │
   │  └─ useStrategicQuery, useFlowsQuery            │
   └─────────────────────────────────────────────────┘
```

### Deux stores, jamais meles

| Store | Contenu | Synchronisation |
|-------|---------|-----------------|
| **graphStore** | nodes, edges, margins, criticalPath, kpis, alerts, propagationPreview, isLoaded | Serveur → client (REST initial + WS deltas) |
| **uiStore** | selectedNodeId, hoveredNodeId, filters, ganttZoom, dragState, detailDrawerOpen, graphNav | Client uniquement |

---

## 5. Moteur DAG (le coeur technique)

### 5.1 GraphService (singleton en memoire)

- `Map<string, GraphNode>` pour les noeuds (O(1) lookup)
- `Map<string, GraphEdge[]>` pour les adjacences sortantes et entrantes
- Charge au demarrage depuis PostgreSQL en ~89ms
- 22 methodes publiques couvrant : traversal, aggregation, subgraph, questions

### 5.2 Propagation

- Parcours topologique depuis le noeud deplace
- Pour chaque successeur : `newStart = max(predecessors.dateFin + delaiMinimum)`
- Mode preview (lecture seule) et mode commit (persistance + broadcast)
- Cible : < 50ms pour 432 noeuds

### 5.3 Chemin critique (CPM)

- Forward pass : early start/finish
- Backward pass : late start/finish
- Float total = late start - early start
- Float libre = min(successors.earlyStart - delaiMinimum) - earlyFinish
- Noeuds critiques : float total = 0
- Persistance dans `cache_marge`

### 5.4 Allocation

- Pour chaque achat partage : alloue aux OF par priorite puis date
- Detecte penuries, surplus, achats obsoletes
- Persistance dans `cache_allocation`

### 5.5 Table Dependance — polymorphe

La table `dependance` utilise `sourceType` (of/achat), `sourceId`, `targetType`, `targetId` comme champs String simples **sans @relation Prisma**. La resolution se fait dans GraphService. C'est un choix delibere pour supporter les aretes OF→OF, OF→Achat, et Achat→OF dans un meme graphe.

---

## 6. Detection d'alertes

Service cron (30 secondes) avec 5 types de detection :

| Type | Severite | Logique |
|------|----------|---------|
| `achat_retard` | WARNING | Date livraison depassee, pas receptionne |
| `penurie` | CRITICAL | Quantite achetee < demande BOM totale |
| `contrainte_violee` | WARNING | OF debut < predecesseur fin + delai |
| `of_orphelin` | INFO | Sous-OF dont le parent est ANNULE |
| `achat_obsolete` | INFO | Achat specifique d'un OF ANNULE |

Reconciliation automatique : les alertes resolues sont auto-dismissees, les nouvelles sont broadcastees via WebSocket.

---

## 7. Endpoints API (complet)

### Graph

| Verbe | Path | Description |
|-------|------|-------------|
| GET | `/graph` | Graphe complet (noeuds, aretes, marges, chemin critique, KPI) |
| GET | `/graph/critical-path` | Recalcul du chemin critique |
| GET | `/graph/impact-zone/:nodeId` | Tous les descendants |
| GET | `/graph/ancestors/:nodeId` | Tous les ancetres |
| GET | `/graph/strategic?groupBy=` | Vue strategique agregee |
| GET | `/graph/flows` | Vue riviere par commande |
| GET | `/graph/subgraph?rootId=&depth=&direction=` | Sous-graphe parametrique |
| POST | `/graph/question` | Reponse a une question sur le graphe |
| POST | `/graph/reload` | Forcer rechargement depuis BDD |

### OF

| Verbe | Path | Description |
|-------|------|-------------|
| GET | `/of` | Liste paginee + filtres |
| GET | `/of/:id` | Detail avec dependances |
| GET | `/of/commandes-clients` | Liste commandes clients avec marges |
| POST | `/of` | Creation |
| PATCH | `/of/:id` | Modification |
| PATCH | `/of/:id/move` | Deplacement avec propagation (commit) |
| POST | `/of/:id/move-preview` | Preview propagation (sans persistance) |
| DELETE | `/of/:id` | Annulation (soft delete) |
| GET | `/of/:id/ancestors` | Ancetres recursifs |
| GET | `/of/:id/descendants` | Descendants recursifs |

### Achat

| Verbe | Path | Description |
|-------|------|-------------|
| GET | `/achat` | Liste paginee + filtres |
| GET | `/achat/:id` | Detail avec allocations |
| GET | `/achat/alertes` | Achats en anomalie |
| POST | `/achat` | Creation |
| PATCH | `/achat/:id` | Modification |
| DELETE | `/achat/:id` | Annulation |

### Autres

| Verbe | Path | Description |
|-------|------|-------------|
| GET | `/kpi` | 4 metriques (OF actifs, tension, couverture, alertes) |
| GET | `/nomenclature/:articleId` | BOM directe |
| GET | `/nomenclature/:articleId/explode` | BOM explosee recursive |
| GET | `/alert` | Alertes actives |
| GET | `/alert/summary` | Compteurs par severite |
| GET | `/alert/detect` | Declenchement manuel detection |
| PATCH | `/alert/:id/dismiss` | Marquer comme traitee |

### WebSocket

| Evenement | Direction | Usage |
|-----------|-----------|-------|
| `of:move-preview` | Client → Serveur | Drag en cours (avec requestId) |
| `of:move-preview-result` | Serveur → Client | Noeuds impactes (avec requestId) |
| `of:move-commit` | Client → Serveur | Confirmation deplacement |
| `graph:updated` | Serveur → Tous | Broadcast apres commit |
| `critical-path:changed` | Serveur → Tous | Chemin critique modifie |
| `kpi:updated` | Serveur → Tous | KPI recalcules |
| `alert:new` | Serveur → Tous | Nouvelle alerte |
| `alert:resolved` | Serveur → Tous | Alerte resolue |

---

## 8. Stack technique

| Couche | Technologie | Version | Role |
|--------|------------|---------|------|
| **Frontend** | React | 19 | UI |
| | Vite | 7 | Bundler |
| | TanStack Router | 1.131 | Routing file-based |
| | TanStack Query | 5.90 | Cache serveur |
| | Zustand + Immer | 5.0 / 10.1 | State management |
| | @fli-dgtf/flow-ui | 1.8 | Composants UI (Base UI) |
| | @xyflow/react | 12.6 | Visualisation graphe (N2, N3) |
| | D3.js | 7.9 | Visualisation (Gantt scales, Heatmap, N1 bulles/flux) |
| | dagre | 0.8 | Layout hierarchique automatique |
| | Framer Motion | 12.12 | Animations |
| | Socket.IO client | 4.8 | WebSocket temps reel |
| | Tailwind CSS | 4.1 | Styling CSS-first |
| | Lucide React | 0.546 | Icones |
| | date-fns | 4.1 | Dates (locale fr) |
| **API** | NestJS | 11 | Framework backend |
| | Prisma | 6.19 | ORM (genere dans api/prisma/generated) |
| | Zod + nestjs-zod | 4.1 / 5.0 | Validation schemas |
| | Socket.IO | 4.8 | WebSocket server |
| | @nestjs/schedule | 5.0 | Cron jobs |
| **IA** | FastAPI | 0.115 | API Python |
| | NetworkX | 3.4 | Algorithmes de graphe |
| | NumPy / SciPy | 2.1 / 1.14 | Calculs numeriques |
| | scikit-learn | 1.5 | ML (clustering, risk scoring) |
| **Infra** | PostgreSQL | 16 | Base de donnees |
| | Redis | 7 | Cache + pub/sub |
| | Docker Compose | - | Orchestration dev |

### Schema de la base (10 tables, 5 enums)

```
Article ←→ Nomenclature (BOM parent/enfant)
Article ←→ OrdreFabrication (article fabrique)
Article ←→ Achat (article achete)
OrdreFabrication ←→ OrdreFabrication (hierarchie parent/sous-OF)
OrdreFabrication ←→ Achat (achat specifique)
Dependance (polymorphe : source/target = OF ou Achat)
CacheMarge (1:1 avec OF)
CacheAllocation (N:N achat-OF)
AuditLog, Scenario, Alerte
```

---

## 9. Donnees du seed

| Table | Volume | Details |
|-------|--------|---------|
| Articles | 29 | 1 PF, 3 SF, 13 communs, 12 specifiques |
| Nomenclatures | 28 | Liens BOM avec options mutually exclusives |
| OF | 240 | 60 finaux + 180 sous-OF sur 6 semaines |
| Achats | 192 | 36 globaux (lots) + 156 specifiques |
| Dependances | 1 116 | Aretes du DAG |
| Alertes | 213 | 206 warnings, 7 critiques (auto-detectees) |

### Problemes injectes

- 5 achats en retard de livraison
- 2 penuries (roues et controleurs electroniques)
- 5 contraintes temporelles violees
- 2 OF orphelins (parent ANNULE)
- 1 achat obsolete
- 1 fournisseur (BatteryWorld) avec 80% de retards

---

## 10. Analyse : ce qui est bien

### Architecture solide

- **Separation claire des responsabilites** : le GraphService gere le DAG en memoire, les controllers sont minces, les services de calcul (propagation, CPM, allocation) sont independants.
- **Deux stores Zustand distincts** : `graphStore` (donnees serveur) et `uiStore` (etat UI) ne se melangent pas. Le `graphNav` dans uiStore gere les niveaux du graphe proprement.
- **Pattern CQRS-lite** coherent : `_entities.ts`, `_contract.ts`, `_ports.ts` par module. Meme structure partout.
- **Polymorphisme de la table Dependance** : choix pragmatique qui evite la complexite de multiples tables de jointure. La resolution est centralisee dans GraphService.

### Multi-echelle du graphe

- **Le principe "jamais plus de 30 noeuds"** est respecte a chaque niveau. La vue strategique agrege en bulles/flux, la vue commande filtre un sous-graphe de 15-25 noeuds, la vue focus zoome sur un voisinage de 10-15 noeuds.
- **La regle d'arret sur les achats partages** dans `/graph/subgraph` est cruciale pour la performance. Sans elle, un achat de roues (60 consommateurs) explose le sous-graphe.
- **Les 4 questions predefinies** couvrent les cas d'usage les plus frequents du planificateur.

### Temps reel

- **Le pattern requestId** sur les move-preview est essentiel. Il evite les sauts d'UI quand les reponses arrivent dans le desordre.
- **Le bandeau de deconnexion + desactivation du drag** est un bon garde-fou UX.

---

## 11. Analyse : ce qui est moins bien

### Frontend — Problemes identifies

| Probleme | Severite | Detail |
|----------|----------|--------|
| **Pas de test frontend** | Haute | Aucun test Vitest. Les stores, les hooks, les transformations de donnees ne sont pas testes. Un changement dans le format de l'API casse silencieusement le frontend (cf. bug `filtered.map is not a function`). |
| **Pas d'error boundary** | Moyenne | Si un composant crash (ex: D3 sur des donnees null), toute l'app tombe. Il faut un `ErrorBoundary` au niveau de chaque vue au minimum. |
| **Le Gantt est un seul fichier de 700+ lignes** | Moyenne | `gantt-chart.tsx` melange layout, rendu SVG, drag-and-drop, WebSocket, et hierarchie des rows. Difficile a maintenir. Il faudrait extraire le hook de drag, le calcul de layout, et le rendu des lignes de dependances. |
| **Les transitions N1→N2 sont des fade simples** | Basse | La spec demandait des transitions morphiques (bulles qui se deplient en noeuds). L'implementation actuelle fait un fade-out/fade-in. C'est correct mais moins spectaculaire. |
| **Le Heatmap "Par client" affiche "Par article"** | Bug | Le label du SelectItem `value="client"` dit "Par article" au lieu de "Par client" (ligne 107 de `_heatmap.route.tsx`). |
| **Pas de virtualisation sur les listes longues** | Basse | La sidebar des commandes (60 items) et la table des OF critiques (15 items) ne posent pas de probleme aujourd'hui, mais a 500+ commandes la sidebar lagguera. |

### Backend — Problemes identifies

| Probleme | Severite | Detail |
|----------|----------|--------|
| **Le endpoint `/of/commandes-clients` fait N queries** | Haute | Pour chaque OF racine, il fait un `prisma.alerte.findMany()` dans la boucle. Avec 60 OF, ca fait 60 queries d'alertes. Il faudrait charger toutes les alertes une fois puis filtrer en memoire. |
| **Le CPM recalcule tout a chaque appel** | Moyenne | `criticalPathService.recalculate()` fait un forward+backward pass complet sur 432 noeuds. C'est 266ms. Pour les move-commit, ca s'ajoute au temps de propagation. Un recalcul incremental (seuls les chemins passant par les noeuds modifies) serait plus performant. |
| **Le cron d'alertes n'a pas de debounce** | Moyenne | Il tourne toutes les 30s ET se declenche a chaque modification du graphe (via le controller). Si un planificateur fait 10 moves en 30s, la detection tourne 10+ fois. |
| **Pas de verrou sur les modifications concurrentes** | Moyenne | Le GraphService a un `version` par noeud mais il n'est pas verifie avant les updates. Deux planificateurs qui deplacent le meme OF simultanement peuvent produire un etat incoherent. |
| **Le service IA n'est pas connecte au backend** | Basse | Le module `ai/` dans le backend (client HTTP vers Python) n'existe pas encore. Le service Python tourne mais personne ne l'appelle. |

### Architecture — Questions ouvertes

| Question | Impact |
|----------|--------|
| **Pas de persistance du graphe en memoire** | Si le serveur redemarre, le graphe est recharge depuis la BDD mais les caches (marge, allocation) sont perdus jusqu'au prochain recalcul. Il faudrait recalculer au demarrage. |
| **Pas d'authentification** | N'importe qui peut modifier le plan. Pas de notion d'utilisateur, de role, ou de permission. |
| **Le scenario what-if est un placeholder** | La table `Scenario` et le snapshot JSON sont prets en BDD, mais aucun endpoint ne l'utilise. C'est la fonctionnalite la plus demandee dans la spec originale apres le drag-and-drop. |
| **Pas de pagination sur GET /graph** | Le endpoint retourne les 432 noeuds d'un coup. C'est ok a cette echelle mais ne tiendra pas a 5 000 noeuds. La vue multi-echelle resout partiellement le probleme (on ne charge que des sous-graphes) mais le chargement initial reste lourd. |

---

## 12. Recommandations

### Court terme (consolider l'existant)

1. **Ajouter des tests unitaires** sur PropagationService, CriticalPathService, et les stores Zustand. Ce sont les parties les plus critiques et les plus susceptibles de regresser.

2. **Fixer le N+1 queries** dans `/of/commandes-clients`. Charger les alertes une fois, construire un `Map<string, number>`, et lookup en O(1).

3. **Ajouter des ErrorBoundary** par vue (Pulse, Gantt, Graph, Heatmap). Un crash dans le D3 du bubble-map ne doit pas casser le reste de l'app.

4. **Decooper `gantt-chart.tsx`** en 3-4 fichiers : `gantt-layout.ts` (calcul des rows), `use-gantt-drag.ts` (hook drag-and-drop), `gantt-dependencies.tsx` (lignes SVG), `gantt-chart.tsx` (orchestration).

5. **Recalculer CPM + allocations au demarrage** du serveur (apres `loadFromDb()`), pas seulement a la demande.

### Moyen terme (fonctionnalites manquantes)

6. **Implementer les scenarios what-if** : c'est le deuxieme differenciateur apres le drag. L'infra BDD est prete, il faut le service + les endpoints + la vue frontend.

7. **Connecter le service IA** : creer le module `ai/` dans le backend NestJS, appeler `/analyze/risk-scoring` apres chaque recalcul CPM, afficher les scores sur les noeuds.

8. **Ajouter l'optimistic update** sur le Gantt : au moment du move-commit, appliquer immediatement le delta cote client sans attendre la reponse serveur, puis reconcilier si la reponse differe.

### Long terme (scalabilite)

9. **CPM incremental** : ne recalculer que les sous-chemins impactes, pas tout le graphe. Gain potentiel : 266ms → < 20ms.

10. **Verrou optimiste** : avant un `propagateCommit`, verifier que le `version` de chaque noeud impacte n'a pas change depuis le dernier `propagatePreview`. Sinon, rejeter et demander un refresh.

11. **Authentification + multi-tenant** : ajouter better-auth (comme dans le projet FLI de reference), un workspace par site de production, des roles (planificateur, lecteur, admin).

12. **Pagination intelligente** : remplacer `GET /graph` (tout d'un coup) par un chargement incremental : d'abord les noeuds critiques, puis le reste en lazy. Le frontend affiche progressivement.

---

## 13. Compteurs finaux

| Metrique | Valeur |
|----------|--------|
| Fichiers source (.ts/.tsx/.py) | 121 |
| Lignes de code (insertions git) | ~26 000 |
| Tables BDD | 10 |
| Endpoints REST | 28 |
| Evenements WebSocket | 8 |
| Modules NestJS | 11 |
| Vues frontend | 5 + tiroir + bandeau |
| Composants graphe | 25 fichiers |
| Noeuds dans le DAG | 432 |
| Aretes dans le DAG | 1 116 |
| Alertes detectees | 213 |
| Temps chargement DAG | 89ms |
| Temps propagation | < 50ms |
| Temps CPM | 266ms |
