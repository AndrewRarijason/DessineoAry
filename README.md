# ✏️ Dessineo Ary !

Jeu de dessin multijoueur en ligne (PC et téléphone) : un joueur dessine, les autres devinent.

- **Front** : React 19 + Vite + TypeScript
- **Back** : Supabase (PostgreSQL, Auth anonyme, Realtime), offre gratuite
- **Hébergement** : Vercel (offre gratuite)

## Règles

| | Mode solo | Mode équipe |
|---|---|---|
| Joueurs | 2 minimum (12 max) | 4 minimum, 2 équipes d'au moins 2 |
| Mot | tiré au hasard | le dessinateur choisit une catégorie |
| Temps pour dessiner | 45 s | 30 s |
| Qui devine | tous les autres joueurs | les coéquipiers du dessinateur |
| Points | le premier qui trouve : +1 | mot trouvé : +1 pour l'équipe |
| Nombre de sets | 5 minimum, chacun dessine autant de fois (2 j. → 6, 3 j. → 6, 4 j. → 8, 5 j. et plus → nb de joueurs) | 3 ou 5 au choix (un set = chaque équipe dessine une fois) |
| Égalité | — | set bonus (mort subite, 2 maximum) |

Les réponses acceptent les fautes de frappe légères, les accents manquants, les articles (« le », « une »…) et le pluriel.
Une réponse « presque » juste n'est affichée qu'à son auteur, pour ne pas dévoiler le mot.

## 1. Créer la base Supabase (gratuit)

1. Créez un compte et un projet sur [supabase.com](https://supabase.com) (aucune carte bancaire nécessaire).
2. **SQL Editor** → collez et exécutez [`supabase/schema.sql`](supabase/schema.sql), puis [`supabase/seed.sql`](supabase/seed.sql).
   Les deux scripts sont ré-exécutables (pour ajouter des mots, complétez `seed.sql` et relancez-le).
3. **Authentication → Sign In / Providers** → activez **Allow anonymous sign-ins**.
4. **Project Settings → API Keys** → notez l'URL du projet et la clé publique (*Publishable key* `sb_publishable_…`, ou l'ancienne *anon key*).

> Le projet gratuit se met en pause après ~7 jours sans activité : il suffit de le relancer depuis le tableau de bord.

## 2. Lancer en local

```bash
npm install
cp .env.example .env.local   # puis remplissez VITE_SUPABASE_URL et VITE_SUPABASE_KEY
npm run dev
```

Ouvrez http://localhost:5173 dans deux navigateurs (ou une fenêtre privée) pour simuler deux joueurs.
Pour tester sur téléphone dans le même Wi-Fi : `npm run dev -- --host`.

## 3. Déployer sur Vercel (gratuit)

1. Poussez le projet sur GitHub.
2. Sur [vercel.com](https://vercel.com) : **Add New → Project** → importez le dépôt (Vercel détecte Vite).
3. Dans **Environment Variables**, ajoutez :
   - `VITE_SUPABASE_URL` et `VITE_SUPABASE_KEY` (les mêmes qu'en local) ;
   - `CRON_SECRET` : une suite aléatoire d'au moins 16 caractères (protège la tâche anti-pause).
4. **Deploy**. Le fichier `vercel.json` redirige les liens d'invitation (`/salle/CODE`) vers l'application.

## 4. Empêcher la mise en pause de Supabase (gratuit)

Un projet Supabase gratuit est mis en pause après ~7 jours sans requêtes. Pour l'éviter sans rien payer,
`vercel.json` déclare **3 tâches planifiées Vercel (Cron Jobs)** par jour (vers 2 h, 10 h et 18 h UTC) qui
appellent [`api/keepalive.ts`](api/keepalive.ts). Cette fonction envoie 3 requêtes à la base (dont
`keep_alive()`, qui met à jour la table `keepalive`). Les Cron Jobs sont inclus dans l'offre Hobby gratuite
(une exécution par jour et par tâche).

- Ça ne fonctionne qu'une fois le projet **déployé en production** sur Vercel.
- Vérification : Vercel → votre projet → **Settings → Cron Jobs** (bouton *Run* pour tester, *View Logs*).
  Côté Supabase, `select * from keepalive;` montre l'heure du dernier passage et le nombre d'appels.

## Sons et musique

Les bruitages et la musique de fond sont générés par le navigateur (Web Audio API) : aucun fichier audio,
aucun droit d'auteur. Les boutons 🔊 et 🎵 (accueil, salon, partie) les coupent ; le choix est mémorisé.
Les animations sont désactivées automatiquement si le système demande de réduire les animations.

## Architecture

```
api/
  keepalive.ts            tâche planifiée Vercel : garde Supabase actif
public/
  DessineoAry.png         logo de la page d'accueil
  site-logo.png           logo du site (source des icônes d'onglet / d'application)
src/
  App.tsx                 connexion anonyme + routage (/ et /salle/CODE)
  lib/audio.ts            bruitages + musique (Web Audio)
  hooks/useSound.ts       sons déclenchés par les événements de la partie
  hooks/useRoom.ts        canal temps réel d'une salle (état, présence, dessin, chronos)
  components/
    Home.tsx              accueil : pseudo, créer / rejoindre une salle
    Lobby.tsx             salon : réglages, équipes, lancement
    Game.tsx              partie : en-tête, canevas, propositions, scores
    DrawingBoard.tsx      canevas + outils, synchronisation des traits
    GuessPanel.tsx        propositions des joueurs
    Results.tsx           classement final, rejouer
  lib/
    api.ts                appels RPC Supabase typés
    drawing.ts            format des traits et messages de dessin
    clock.ts              synchronisation de l'horloge avec le serveur
supabase/
  schema.sql              tables, sécurité (RLS), logique du jeu (fonctions RPC)
  seed.sql                9 catégories, ~250 mots (dont une catégorie Madagascar)
```

## Crédits

Jeu imaginé et développé par **Andrew Rarijason**, © 2026.

## Fonctionnement

**Principe** : toute la logique de jeu (tours, chronos, vérification des réponses, scores) s'exécute dans
PostgreSQL via des fonctions RPC. Le mot secret est stocké dans une table illisible par les joueurs : seul le
dessinateur le reçoit. Les clients s'abonnent aux changements des tables (Realtime) pour se mettre à jour.
Le dessin, lui, ne passe pas par la base : les traits sont diffusés en direct (Realtime Broadcast), regroupés
toutes les 100 ms pour rester dans le quota gratuit. Quand un chrono expire, les clients demandent au serveur
de passer à la phase suivante (`advance_room`), qui vérifie l'heure lui-même.
