# TypeORM MSSQL Generator

# TypeORM Entity Generator (MSSQL & PostgreSQL)

Este script es una herramienta CLI diseñada para conectarse a una base de datos SQL Server (MSSQL), extraer su esquema completo (tablas, columnas, restricciones, relaciones) y generar automáticamente las entidades de **TypeORM** (archivos `.entity.ts`) listas para integrarse en tu proyecto (NestJS, Express, etc.).
Este script es una herramienta CLI diseñada para conectarse a una base de datos **SQL Server (MSSQL)** o **PostgreSQL**, extraer su esquema completo (tablas, columnas, restricciones, relaciones) y generar automáticamente las entidades de **TypeORM** (archivos `.entity.ts`) listas para integrarse en tu proyecto (NestJS, Express, etc.).

## Requisitos Previos

Asegúrate de haber instalado las dependencias del proyecto antes de ejecutarlo:

```bash
pnpm install
# o con npm
npm install
# o con pnpm
pnpm install
```

El script utiliza [`tsx`](https://github.com/privatenumber/tsx) para ejecutar directamente el código TypeScript sin necesidad de compilarlo primero.

## Uso Básico

El archivo principal a ejecutar es `src/main.ts`. Debes proporcionar, como mínimo, el nombre de la base de datos, el usuario y la contraseña.

### MSSQL (Default)

```bash
npx tsx src/main.ts --database "NombreBaseDatos" --user "Usuario" --password "TuContraseña"
```

### PostgreSQL

```bash
npx tsx src/main.ts --driver postgres --database "NombreBaseDatos" --user "postgres" --password "TuContraseña"
```

## Opciones Disponibles

Puedes personalizar la conexión y la generación pasando los siguientes parámetros a través de la terminal:

| Opción Corta | Opción Larga | Descripción                                                                  | Requerido | Valor por Defecto                  |
| :----------: | :----------- | :--------------------------------------------------------------------------- | :-------: | :--------------------------------- |
|     `-D`     | `--driver`   | Motor de base de datos (`mssql` \| `postgres`).                              |    No     | `mssql`                            |
|     `-s`     | `--server`   | Dirección IP o dominio del servidor de base de datos.                        |    No     | `localhost`                        |
|     `-P`     | `--port`     | Puerto de conexión de la base de datos.                                      |    No     | `1433`                             |
|     `-P`     | `--port`     | Puerto de conexión (1433 para MSSQL, 5432 para Postgres).                    |    No     | `1433` (mssql) / `5432` (postgres) |
|     `-d`     | `--database` | Nombre de la base de datos.                                                  |  **Sí**   | -                                  |
|     `-u`     | `--user`     | Usuario para conectarse a la base de datos.                                  |  **Sí**   | -                                  |
|     `-p`     | `--password` | Contraseña del usuario.                                                      |  **Sí**   | -                                  |
|     `-o`     | `--output`   | Carpeta de destino donde se generarán los archivos `.entity.ts`.             |    No     | `typeorm-entities`                 |
|     `-e`     | `--encrypt`  | Habilitar encriptación en la conexión (necesario en entornos como Azure).    |    No     | `false`                            |
|     `-t`     | `--trust`    | Confiar en el certificado SSL del servidor (ideal para desarrollos locales). |    No     | `true`                             |
|     `-e`     | `--encrypt`  | Habilitar encriptación en la conexión MSSQL.                                 |    No     | `false`                            |
|     `-t`     | `--trust`    | Confiar en el certificado SSL del servidor MSSQL.                            |    No     | `true`                             |
|     `-h`     | `--help`     | Muestra la ayuda y lista completa de comandos en la terminal.                |    No     | -                                  |

## Ejemplos de Uso

**1. Generar entidades de una base de datos local**
**1. Generar entidades de una base de datos MSSQL local**
Con los valores por defecto (`localhost:1433`), puedes omitir el servidor y el puerto:

```bash
npx tsx src/main.ts -d MiClinicaDB -u sa -p "Admin123!"
```

_(Las entidades generadas se guardarán en la carpeta `typeorm-entities/`)_.

**2. Guardar entidades en una carpeta específica del proyecto**
**2. Generar entidades de una base de datos PostgreSQL**
Para conectarte a PostgreSQL y guardar los archivos en una carpeta específica como `bd`:

```bash
npx tsx src/main.ts -D postgres -s localhost -P 5432 -d mi_bd -u postgres -p "123" -o bd
```

**3. Guardar entidades en una carpeta específica del proyecto**
Si quieres que los archivos se generen directamente en tu carpeta de código (por ejemplo, `src/modules/entities`), usa `-o`:

```bash
npx tsx src/main.ts -d MiClinicaDB -u sa -p "Admin123!" -o ./src/modules/entities
```

**3. Conectarse a un servidor de producción o remoto**
**4. Conectarse a un servidor remoto de PostgreSQL**

```bash
npx tsx src/main.ts -s 192.168.1.150 -P 14330 -d ClinicaPro -u admin -p "secreto"
npx tsx src/main.ts --driver postgres --server 192.168.1.100 --port 5432 --database mi_bd --user admin --password "secreto" -o ./src/entities
```

**4. Conectarse a una base de datos en Azure SQL**
**5. Conectarse a una base de datos en Azure SQL (MSSQL)**
Para conexiones remotas estrictas, podrías necesitar activar la encriptación (`-e` o `--encrypt`):

```bash
npx tsx src/main.ts -s mi-server.database.windows.net -d ClinicaPro -u admin -p "MiPassword" -e -t false
```

## ¿Qué ocurre durante la ejecución?

1. **Conexión:** Se realiza la conexión a la base de datos configurada.
2. **Extracción:** Obtiene todas las tablas, columnas, claves primarias, claves foráneas, y otras restricciones del sistema.
3. **Conexión:** Se realiza la conexión a la base de datos configurada (MSSQL o PostgreSQL).
4. **Extracción:** Obtiene todas las tablas, columnas, claves primarias, claves foráneas, y restricciones del sistema de forma optimizada.
5. **Log Intermedio:** Crea o actualiza un archivo local llamado `output.json` donde podrás auditar todo el volcado del esquema extraído de la base de datos.
6. **Generación:** Procesa la información del JSON y crea un archivo TypeScript (con el sufijo `.entity.ts`) por cada tabla. Cada clase contendrá las columnas mapeadas a sus tipos de datos, así como los decoradores correspondientes de TypeORM (`@Entity`, `@Column`, `@PrimaryGeneratedColumn`, relaciones como `@ManyToOne` y `@OneToMany`).
