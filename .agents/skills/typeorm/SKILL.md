---
name: typeorm-entities
description: Guía de buenas prácticas para diseñar y crear entidades TypeORM (decoradores, relaciones, índices, migraciones, naming, soft-delete, validación). Úsalo siempre que el usuario pida crear, revisar, refactorizar o diseñar entidades, modelos de datos, esquemas de base de datos, o archivos .entity.ts en un proyecto con TypeORM (NestJS, Express, etc.), aunque no use la palabra "entidad" explícitamente — por ejemplo "crea el modelo de Usuario", "necesito la tabla de pedidos", "define la relación entre Product y Category", "cómo hago soft delete en TypeORM".
---

# TypeORM Entities — Buenas Prácticas

Guía práctica para generar entidades TypeORM production-ready: consistentes, tipadas, con relaciones correctas e índices donde importa.

## Flujo de trabajo

1. **Entender el dominio**: qué entidades existen, sus atributos, relaciones (1-1, 1-N, N-N) y reglas de negocio relevantes (borrado lógico, unicidad, auditoría).
2. **Decidir la base**: ¿hay una `BaseEntity` abstracta en el proyecto? Si no existe y se van a crear 2+ entidades, proponerla (ver sección "Entidad base").
3. **Generar cada entidad** siguiendo las convenciones de este documento.
4. **Revisar relaciones**: dirección (owning side), `onDelete`, `eager` vs `lazy`, necesidad de `@JoinColumn`/`@JoinTable`.
5. **Revisar índices y constraints**: columnas por las que se filtra/ordena seguido, unicidad, FKs compuestas.
6. **Nunca activar `synchronize: true` en producción** — recordar migraciones (ver sección final).

Para relaciones complejas (N-N, self-referencing, herencia de tablas, columnas embebidas) o dudas de sintaxis exacta, consultar `references/relations-avanzadas.md`. Para un ejemplo completo copiable, usar `assets/entity-template.ts`.

---

## 1. Convenciones de nombres

- **Clase**: `PascalCase` singular → `User`, `OrderItem` (no `Users`, no `OrderItems`).
- **Archivo**: `kebab-case.entity.ts` → `user.entity.ts`, `order-item.entity.ts`.
- **Tabla**: snake_case plural, explícito en `@Entity('order_items')`. No depender del nombre de la clase para el nombre de tabla: es más fácil de mantener si cambia el nombre de la clase.
- **Columnas**: snake_case en la base de datos, camelCase en TypeScript. Usar una **naming strategy** global (ej. `typeorm-naming-strategies` con `SnakeNamingStrategy`) en vez de poner `name: 'created_at'` en cada `@Column`. Si el proyecto no tiene naming strategy configurada, sugerirla antes de escribir columna por columna.
- **Relaciones**: la propiedad FK singular en el lado "muchos" (`user: User`), la colección en plural en el lado "uno" (`orders: Order[]`).

## 2. Estructura mínima de una entidad

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  fullName: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
```

Reglas clave:
- **Siempre tipar explícitamente `@Column({ type: ... })`**. No confiar en la inferencia automática: cambia entre drivers (postgres/mysql/sqlite) y rompe migraciones silenciosamente.
- **Siempre poner `length` en `varchar`/`char`** cuando el driver lo soporte (evita columnas `TEXT`/sin límite por accidente).
- **`nullable: false` es el default** — solo agregar `nullable: true` cuando el campo realmente sea opcional, y en ese caso tipar la propiedad en TS como `campo?: tipo | null`.
- **Nunca usar `any`** como tipo de columna en TypeScript; para JSON usar `@Column({ type: 'jsonb' })` con una interfaz TS.

## 3. Claves primarias

| Estrategia | Cuándo usarla |
|---|---|
| `@PrimaryGeneratedColumn('uuid')` | Default recomendado: IDs no predecibles, seguros para exponer en APIs públicas, sin colisión en sistemas distribuidos. |
| `@PrimaryGeneratedColumn()` (int autoincrement) | Sistemas internos simples, o cuando el orden de inserción importa para debugging/paginación por cursor numérico. |
| `@PrimaryGeneratedColumn('rowid')` | Solo SQLite. |
| `@PrimaryColumn()` compuesta | Tablas de unión N-N con datos propios (ver `references/relations-avanzadas.md`). |

No mezclar estrategias entre entidades relacionadas sin razón — genera fricción en joins y en el código cliente.

## 4. Entidad base

Si el proyecto tiene varias entidades, extraer una clase abstracta para no repetir auditoría:

```typescript
import { PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';

export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}
```

Luego: `export class User extends BaseEntity { ... }`. Ventaja: soft-delete y auditoría consistentes en todo el esquema. Si algunas entidades no deben tener soft-delete (ej. tablas de log inmutables), no las hagas heredar de esta clase — crear una segunda base sin `@DeleteDateColumn`.

## 5. Relaciones — reglas rápidas

- **Elegí el tipo correcto primero**: `@OneToMany`/`@ManyToOne` es la pareja más común; `@ManyToMany` casi siempre debería modelarse como dos `@ManyToOne` hacia una tabla intermedia explícita si esa tabla necesita columnas propias (fecha de asociación, rol, cantidad, etc.).
- **El lado dueño (`@JoinColumn`) va donde vive la FK**. En `@ManyToOne`, ese lado siempre es el dueño; no hace falta `@JoinColumn` explícito salvo que quieras renombrar la columna FK.
- **`eager: true` con moderación**: solo en relaciones que se necesitan *siempre* que se carga la entidad (ej. `User.profile`). Para el resto, cargar explícitamente con `relations: [...]` o query builder — el eager loading global genera N+1 y joins innecesarios.
- **Definir `onDelete` explícitamente** en toda `@ManyToOne`/`@OneToOne`: `'CASCADE'`, `'SET NULL'` o `'RESTRICT'` según la regla de negocio. No dejar el default implícito del motor.
- **`cascade` de TypeORM (insert/update automático de relaciones) es distinto de `onDelete` de SQL** — usarlo solo cuando de verdad quieras que guardar el padre guarde también hijos nuevos, y aun así preferir `cascade: ['insert']` puntual antes que `cascade: true` global.
- Detalle de sintaxis (uno-a-uno, muchos-a-muchos con tabla intermedia, self-referencing, herencia) → `references/relations-avanzadas.md`.

## 6. Índices y constraints

- `@Index()` en toda columna usada frecuentemente en `WHERE`, `ORDER BY` o como FK que TypeORM no indexe automáticamente.
- `@Unique(['campo'])` a nivel de entidad para unicidad simple, o `unique: true` en el `@Column` mismo.
- Para unicidad compuesta: `@Index(['tenantId', 'slug'], { unique: true })` a nivel de clase, encima de `@Entity`.
- Nombrar los índices explícitamente en proyectos grandes (`@Index('idx_users_email')`) para que las migraciones sean legibles.

## 7. Enums

```typescript
export enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

@Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
status: OrderStatus;
```

Usar `enum` de Postgres/MySQL nativo cuando el driver lo soporte; en SQLite, TypeORM lo simula con `CHECK` (funciona igual desde el código). Siempre poner `default`.

## 8. Separación de responsabilidades

- **La entidad modela persistencia, no lógica de negocio pesada.** Métodos triviales de dominio (ej. `isExpired()`) están bien; validaciones de negocio complejas o llamadas a servicios, no.
- **No reusar la entidad como DTO de entrada/salida de la API.** Crear DTOs separados (`CreateUserDto`, `UserResponseDto`) para no exponer columnas internas ni acoplar el contrato HTTP al esquema de base de datos.
- **Validación de formato** (email válido, longitud, rangos) con `class-validator` en los DTOs, no en la entidad — la entidad ya define el esquema; duplicar reglas ahí genera dos fuentes de verdad.
- Un archivo por entidad. Si el proyecto es modular (NestJS), la entidad vive junto a su módulo (`users/user.entity.ts`), no en una carpeta `entities/` global salvo que el proyecto ya siga esa convención.

## 9. Migraciones, no `synchronize: true`

- `synchronize: true` es solo para desarrollo local rápido o prototipos. En cualquier entorno compartido o producción, **usar migraciones**: `typeorm migration:generate` después de cada cambio de entidad, revisar el SQL generado antes de commitear.
- Si el usuario está iterando el diseño de entidades activamente, está bien dejar `synchronize: true` en local — pero mencionarlo explícitamente y recordar generar la migración final antes de mergear.
- Nunca editar una migración ya aplicada en otro entorno: crear una nueva migración correctiva.

## 10. Checklist final antes de entregar una entidad

- [ ] Tipos de columna explícitos, con `length` donde aplica
- [ ] `nullable` reflejado correctamente en el tipo TS (`campo?: tipo | null`)
- [ ] PK con estrategia consistente con el resto del esquema
- [ ] Relaciones con `onDelete` explícito y lado dueño correcto
- [ ] `eager` usado solo donde de verdad se necesita siempre
- [ ] Índices en columnas de filtro/orden frecuente y en unicidad
- [ ] Enums con `default`
- [ ] Nombre de tabla explícito en `@Entity('...')`
- [ ] Sin lógica de negocio pesada ni uso como DTO de API
- [ ] Si es un cambio a un esquema existente: migración generada, no solo `synchronize`
