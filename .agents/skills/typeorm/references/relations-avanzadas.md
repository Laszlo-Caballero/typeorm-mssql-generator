# Relaciones avanzadas en TypeORM

Referencia de sintaxis para casos que van más allá del `@ManyToOne`/`@OneToMany` básico. Volver a `SKILL.md` para las reglas generales (onDelete, eager, cascade).

## Índice
- Uno a muchos / Muchos a uno
- Uno a uno
- Muchos a muchos (simple)
- Muchos a muchos con columnas propias (tabla intermedia explícita) — recomendado
- Self-referencing (árbol / jerarquía)
- Columnas embebidas (`@Column(() => X)`)
- Herencia de tablas

---

## Uno a muchos / Muchos a uno

```typescript
// category.entity.ts
@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToMany(() => Product, (product) => product.category)
  products: Product[];
}

// product.entity.ts
@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Category, (category) => category.products, {
    onDelete: 'RESTRICT', // no permitir borrar una categoría con productos
    nullable: false,
  })
  category: Category;
}
```

El lado `@ManyToOne` es siempre el dueño de la FK; no necesita `@JoinColumn` salvo que quieras renombrar la columna (por defecto será `categoryId`).

## Uno a uno

```typescript
// user.entity.ts
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Profile, (profile) => profile.user, { cascade: ['insert'] })
  profile: Profile;
}

// profile.entity.ts
@Entity('profiles')
export class Profile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user) => user.profile)
  @JoinColumn() // este lado tiene la FK (userId) y es el dueño
  user: User;
}
```

Poné `@JoinColumn()` en el lado que "pertenece" conceptualmente al otro (aquí, el perfil pertenece al usuario). Solo un lado puede tener `@JoinColumn()`.

## Muchos a muchos (simple, sin datos propios)

Usar solo cuando la tabla intermedia no necesita columnas extra (ni fecha, ni cantidad, ni rol):

```typescript
// post.entity.ts
@Entity('posts')
export class Post {
  @ManyToMany(() => Tag, (tag) => tag.posts)
  @JoinTable({ name: 'post_tags' }) // solo en el lado dueño
  tags: Tag[];
}

// tag.entity.ts
@Entity('tags')
export class Tag {
  @ManyToMany(() => Post, (post) => post.tags)
  posts: Post[];
}
```

## Muchos a muchos con columnas propias (recomendado en la mayoría de casos reales)

En cuanto la relación necesita metadata (fecha de inscripción, rol, cantidad), modelar la tabla intermedia como entidad explícita con dos `@ManyToOne`:

```typescript
// order-item.entity.ts — ejemplo: Order <-> Product con cantidad y precio
@Entity('order_items')
@Index(['order', 'product'], { unique: true })
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  order: Order;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  product: Product;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  unitPrice: string; // numeric vuelve como string en TypeORM/pg por precisión
}
```

Esto da control total sobre índices, validaciones y consultas, y evita las limitaciones del `@ManyToMany` automático de TypeORM (que no soporta bien columnas extra).

## Self-referencing (jerarquías / árboles)

```typescript
@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Category, (category) => category.children, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  parent: Category | null;

  @OneToMany(() => Category, (category) => category.parent)
  children: Category[];
}
```

Para árboles profundos con queries de ancestros/descendientes eficientes, considerar los decoradores `@Tree('closure-table')` / `@TreeParent` / `@TreeChildren` de TypeORM en vez de esta relación manual.

## Columnas embebidas

Útil para agrupar campos relacionados (ej. dirección) sin crear una tabla/relación aparte:

```typescript
export class Address {
  @Column({ type: 'varchar', length: 255 })
  street: string;

  @Column({ type: 'varchar', length: 100 })
  city: string;

  @Column({ type: 'varchar', length: 20 })
  zipCode: string;
}

@Entity('users')
export class User {
  @Column(() => Address)
  address: Address;
}
```

Genera columnas `address_street`, `address_city`, `address_zip_code` en la misma tabla. No usar para datos que necesiten su propio ciclo de vida (borrado independiente, relaciones propias) — ahí corresponde una entidad real.

## Herencia de tablas

- **Single Table Inheritance** (`@TableInheritance` + `@ChildEntity`): una sola tabla física, columna discriminadora. Bueno cuando las subclases comparten casi todas las columnas.
- **Class Table Inheritance / Concrete**: menos soportado directamente por TypeORM; en la práctica suele preferirse composición (una entidad base + relación 1-1 a la tabla específica) antes que herencia real de tablas.

Usar herencia de tablas solo si el dominio realmente lo pide (ej. `Payment` con subtipos `CardPayment`, `BankTransferPayment` que comparten 90% de columnas). Para casos simples, un campo `type` + columnas nullable suele ser más simple de mantener que la herencia de TypeORM.
