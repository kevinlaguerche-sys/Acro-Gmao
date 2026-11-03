# Sauvegarde ACRO Plongée

Cette archive regroupe le code source de l'application GitHub Pages, les ressources et l'Edge Function Supabase `member-access`.

## Contenu
- Application web complète du dépôt (HTML, icônes, manifeste et images).
- Edge Function `member-access` (version 11 au 3 novembre 2026).
- Ce fichier de repères de restauration.

## Important : données Supabase
Cette archive de code ne contient PAS les données privées des adhérents, les comptes Auth, les mots de passe, les journaux de connexion, les événements, les notifications, ni les politiques SQL complètes. Ces données restent dans le projet Supabase `qaxqnfwjfllxulewdxvs` et ne doivent pas être publiées dans l'archive publique GitHub.

Pour une sauvegarde complète des données, effectuer une exportation privée depuis Supabase (Dashboard > Database > Backups, ou export SQL via Supabase CLI avec l'URL de connexion conservée secrète). Conserver le dump SQL dans un emplacement privé et sécurisé, séparément de cette archive de code.

## Restauration du site
1. Extraire l'archive.
2. Publier les fichiers du dépôt sur GitHub Pages.
3. Reconfigurer la clé publique Supabase dans la configuration de l'application si nécessaire.
4. Déployer l'Edge Function depuis `supabase/functions/member-access/index.ts` avec les secrets Supabase gérés côté serveur.
5. Restaurer séparément la base SQL et les comptes Auth depuis une sauvegarde privée.

Ne jamais mettre une clé `service_role`, un mot de passe de base de données ou des données personnelles des adhérents dans GitHub Pages ou dans un dépôt public.
