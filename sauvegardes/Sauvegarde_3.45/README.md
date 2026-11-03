# Sauvegarde 3.45 — ACRO Plongée

Date : 3 novembre 2026

Cette branche est un instantané du site au commit 657e44649386bc0424f9ba70dc25546615b76666.

## Contenu
- `index.html` : application web complète à cette date.
- `sauvegardes/Sauvegarde_3.45/supabase-manifest.json` : structure des tables publiques, migrations enregistrées et informations du projet Supabase.
- `sauvegardes/Sauvegarde_3.45/functions/member-access/index.ts` : source de la fonction Edge active.

## Important — restauration
Cette sauvegarde de code ne constitue pas un dump intégral de la base de données. Les données des adhérents, évaluations, événements, notifications, profils, journaux, comptes Auth, mots de passe, clés API et secrets ne sont pas inclus dans le dépôt public. Il faudra effectuer/exporter séparément une sauvegarde privée Supabase avant une restauration complète. Les secrets doivent être reconfigurés depuis Supabase, jamais stockés dans GitHub.

Projet Supabase : `qaxqnfwjfllxulewdxvs` (région eu-west-1).
