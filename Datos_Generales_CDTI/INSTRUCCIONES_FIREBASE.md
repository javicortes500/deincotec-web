# Configuración de Firebase para el Sistema de Usuarios

## ⚠️ Error Actual
**"Missing or insufficient permissions"** indica que las reglas de seguridad de Firestore no permiten escribir en la colección de usuarios.

## 📋 Solución - Actualizar Reglas de Firestore

### Pasos para Configurar las Reglas:

1. **Accede a la Consola de Firebase:**
   - Ve a https://console.firebase.google.com/
   - Selecciona tu proyecto

2. **Navega a Firestore Database:**
   - En el menú lateral, haz clic en "Firestore Database"
   - Haz clic en la pestaña "Reglas" (Rules)

3. **Copia y Pega las Reglas:**
   - Abre el archivo `firestore.rules` que se ha creado
   - Copia todo el contenido
   - Pégalo en el editor de reglas de Firebase
   - Haz clic en "Publicar" (Publish)

### Reglas Simplificadas (Para Desarrollo):

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    match /usuarios/{userId} {
      allow read, write: if true;
    }
    
    match /clientes/{clientId} {
      allow read, write: if true;
    }
  }
}
```

### ⚠️ IMPORTANTE - Seguridad

Las reglas actuales (`if true`) permiten acceso completo sin autenticación. Esto está bien para:
- Desarrollo local
- Testing
- Aplicaciones internas con acceso controlado por contraseñas

**Para producción pública, considera:**
- Implementar Firebase Authentication
- Usar reglas basadas en `request.auth.uid`
- Validar permisos por rol de usuario

## 🔄 Después de Actualizar las Reglas

1. Las reglas tardan unos segundos en aplicarse
2. Recarga la aplicación web
3. Intenta crear un usuario nuevamente desde el panel admin

## 📊 Estructura de Datos Creada

### Colección: `/usuarios/{userId}`
```javascript
{
  password: "contraseña-del-cliente",
  activo: true,
  createdAt: Timestamp,
  createdBy: "admin"
}
```

### Colección: `/clientes/{userId}`
```javascript
{
  timestamp: Timestamp,
  instNIF: "",
  instNombre: "",
  // ... resto de campos del formulario
}
```

## 🎯 Flujo del Sistema

1. **Admin crea usuario:**
   - Desde panel admin → "Crear Nuevo Usuario"
   - Se crea documento en `/usuarios/{userId}`
   - Se crea documento vacío en `/clientes/{userId}`

2. **Cliente accede:**
   - Introduce contraseña en login
   - Sistema valida contra `/usuarios`
   - Si es válida y activa, carga datos de `/clientes/{userId}`

3. **Cliente completa formulario:**
   - Datos se guardan automáticamente en `/clientes/{userId}`
   - Admin puede ver datos en tiempo real

## 🔧 Alternativa Rápida (Si no puedes acceder a Firebase Console)

Si no tienes acceso a la consola de Firebase, puedes usar la Firebase CLI:

```bash
# Instalar Firebase CLI (si no está instalado)
npm install -g firebase-tools

# Login
firebase login

# Inicializar proyecto
firebase init firestore

# Desplegar reglas
firebase deploy --only firestore:rules
```

## ✅ Verificación

Después de actualizar las reglas, deberías poder:
- ✅ Crear nuevos usuarios desde el panel admin
- ✅ Ver lista de usuarios existentes
- ✅ Activar/desactivar usuarios
- ✅ Eliminar usuarios
- ✅ Los clientes pueden acceder con sus contraseñas
