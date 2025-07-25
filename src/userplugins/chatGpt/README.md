# Plugin ChatGPT pour Equicord

Ce plugin permet d'utiliser ChatGPT directement dans Discord via une commande slash.

## 🔧 Installation

### 1. **Copier le fichier template**
```bash
cp index.template.ts index.ts
```

### 2. **Configurer votre clé API**
1. Obtenez votre clé API OpenAI sur https://platform.openai.com/api-keys
2. Ouvrez le fichier `index.ts`
3. Remplacez `"VOTRE_CLE_API_ICI"` par votre vraie clé API

### 3. **Vérifier que le fichier est ignoré par Git**
Le fichier `index.ts` avec votre clé API est automatiquement ignoré par Git pour votre sécurité.

## 🚀 Utilisation

Utilisez la commande slash `/chatgpt` suivie de votre question :
```
/chatgpt question: Comment créer un plugin Discord ?
```

## ⚠️ **SÉCURITÉ IMPORTANTE**

- **JAMAIS** ne commitez le fichier `index.ts` avec votre vraie clé API
- **JAMAIS** ne partagez votre clé API publiquement
- Le fichier est dans `.gitignore` pour votre protection
- Si vous devez partager le code, utilisez `index.template.ts`

## 🔄 Mise à jour

Quand vous mettez à jour Equicord :
1. Sauvegardez votre clé API quelque part
2. Après la mise à jour, reconfigurez le plugin si nécessaire
3. Remettez votre clé API dans le nouveau fichier

## 🐛 Dépannage

Si le plugin ne fonctionne pas :
1. Vérifiez que votre clé API est valide
2. Vérifiez que vous avez des crédits OpenAI
3. Regardez la console Discord pour les erreurs

## 📝 Notes

- Le plugin utilise le modèle `gpt-3.5-turbo` par défaut
- Chaque utilisation consomme vos crédits OpenAI
- Les réponses sont affichées sous forme d'embed dans le chat 