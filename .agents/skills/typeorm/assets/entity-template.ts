/**
 * Plantilla de referencia para una entidad TypeORM completa.
 * Copiar, renombrar y adaptar campos/relaciones según el dominio real.
 *
 * Incluye: entidad base con auditoría + soft delete, columna con enum,
 * relación many-to-one con onDelete explícito, índice único compuesto.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  Index,
} from 'typeorm';

// --- Entidad base reutilizable (ver SKILL.md sección 4) ---
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

// --- Enum de dominio ---
export enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

// --- Entidad relacionada mínima (para el ejemplo de ManyToOne) ---
@Entity('customers')
export class Customer extends BaseEntity {
  @Column({ type: 'varchar', length: 150 })
  fullName: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @OneToMany(() => Order, (order) => order.customer)
  orders: Order[];
}

// --- Entidad principal de ejemplo ---
@Entity('orders')
@Index(['customer', 'externalReference'], { unique: true })
export class Order extends BaseEntity {
  @Column({ type: 'varchar', length: 50 })
  externalReference: string;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  totalAmount: string; // numeric llega como string por precisión en pg

  @ManyToOne(() => Customer, (customer) => customer.orders, {
    nullable: false,
    onDelete: 'RESTRICT', // no borrar un cliente con pedidos existentes
  })
  customer: Customer;
}
