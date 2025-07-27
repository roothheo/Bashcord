# 🎤 PitchProof - Modificateur de Voix Discord

Un plugin Vencord qui permet de modifier votre voix en temps réel pendant les appels vocaux Discord.

## ✨ Fonctionnalités

### 🎛️ **Modification de Pitch**
- Ajustement du pitch de -12 à +12 demi-tons
- Changement en temps réel
- Qualité audio configurable

### 🎭 **Effets Vocaux**
- **Robot** : Voix robotique avec filtre passe-haut
- **Écho** : Effet d'écho avec délai
- **Réverbération** : Effet de résonance
- **Distortion** : Distorsion de la voix
- **Chorus** : Effet de chœur
- **Helium** : Voix aiguë (comme l'hélium)
- **Deep Voice** : Voix grave

### ⚙️ **Paramètres Avancés**
- Qualité audio (faible/moyenne/élevée)
- Activation automatique en vocal
- Traitement en temps réel

## 🚀 Installation

1. Placez le dossier `pitchProof` dans `src/userplugins/`
2. Redémarrez Discord
3. Activez le plugin dans les paramètres Vencord

## 📖 Utilisation

### **Commandes Slash**

#### `/pitch <niveau>`
Modifie le pitch de votre voix
- `niveau` : -12 à +12 demi-tons
- Exemple : `/pitch 6` pour une voix plus aiguë

#### `/voiceeffect <effet>`
Applique un effet vocal
- `effet` : robot, echo, reverb, distortion, chorus, helium, deep
- Exemple : `/voiceeffect robot`

#### `/pitchproof`
Active/désactive PitchProof rapidement

### **Interface Graphique**

1. Allez dans **Paramètres Discord** → **Vencord** → **Plugins**
2. Trouvez **PitchProof** dans la liste
3. Configurez vos paramètres :
   - ✅ Activer PitchProof
   - 🎛️ Ajuster le pitch (-12 à +12)
   - 🎭 Choisir un effet vocal
   - ⚙️ Configurer la qualité

## 🎯 Exemples d'Utilisation

### **Voix d'Hélium**
```
/pitch 12
/voiceeffect helium
```

### **Voix de Robot**
```
/pitch 0
/voiceeffect robot
```

### **Voix Grave**
```
/pitch -6
/voiceeffect deep
```

### **Voix avec Écho**
```
/pitch 0
/voiceeffect echo
```

## ⚠️ Limitations

1. **Latence** : Le traitement audio ajoute une légère latence
2. **Qualité** : Certains effets peuvent dégrader la qualité audio
3. **Compatibilité** : Fonctionne uniquement sur Discord Desktop
4. **Ressources** : Utilise plus de CPU selon la qualité choisie

## 🔧 Dépannage

### **Le plugin ne fonctionne pas**
1. Vérifiez que vous êtes en vocal
2. Assurez-vous que le plugin est activé
3. Vérifiez les permissions microphone
4. Redémarrez Discord

### **Latence élevée**
1. Réduisez la qualité audio dans les paramètres
2. Désactivez les effets complexes
3. Fermez d'autres applications gourmandes

### **Qualité audio dégradée**
1. Utilisez la qualité "élevée"
2. Évitez les effets de distortion
3. Ajustez le pitch modérément

## 🎨 Personnalisation

### **Paramètres Recommandés**

#### **Gaming**
- Pitch : 0 à +3
- Effet : Aucun ou Robot
- Qualité : Moyenne

#### **Streaming**
- Pitch : -2 à +2
- Effet : Réverbération
- Qualité : Élevée

#### **Fun**
- Pitch : -12 à +12
- Effet : Helium/Deep
- Qualité : Faible

## 📝 Notes Techniques

- Utilise l'API Web Audio pour le traitement
- Compatible avec tous les codecs audio Discord
- Traitement en temps réel avec ScriptProcessorNode
- Gestion automatique des ressources audio

## 🤝 Support

Si vous rencontrez des problèmes :
1. Vérifiez la console Discord (F12)
2. Consultez les logs du plugin
3. Testez avec des paramètres par défaut
4. Signalez les bugs avec les logs d'erreur

---

**Développé par Bash** - Plugin Vencord pour Discord Desktop 