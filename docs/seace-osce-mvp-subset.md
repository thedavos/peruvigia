# Subset SEACE/OSCE para el MVP

## Decision

Para el MVP no conviene importar "todo SEACE". El subset inicial recomendado es:

1. `Personas declaradas en la conformacion juridica de proveedores en el RNP`
2. `Datos de la Adjudicacion`
3. `Entidades Contratantes`

Este recorte prioriza la cadena de cruce mas util para Vigia:

`persona -> proveedor -> adjudicacion -> entidad contratante`

Con este subset podemos responder preguntas utiles para el MVP sin abrir todavia el frente completo de contratos, ordenes, convocatorias y planes.

## Por que este subset

### 1. Personas declaradas en la conformacion juridica de proveedores en el RNP

Este dataset es la mejor puerta de entrada para cruces con personas, porque expone la relacion entre personas naturales o juridicas y proveedores inscritos en el RNP, incluyendo roles como socios, accionistas, titulares, representantes legales y miembros de organos de administracion.

Valor para el MVP:

- Permite crear `person_entity_links` con evidencia oficial.
- Conecta mejor con el modelo actual, que ya soporta relaciones persona-entidad y persona-persona.
- Hace posible detectar si una persona declarada en DJI tambien aparece vinculada a un proveedor del Estado, incluso cuando la empresa no fue declarada directamente en la DJI.
- Tiene una frecuencia de actualizacion mensual declarada en la pagina del dataset.

Fuente oficial:

- [Personas declaradas en la conformacion juridica de proveedores en el RNP](https://www.datosabiertos.gob.pe/dataset/personas-declaradas-en-la-conformaci%C3%B3n-jur%C3%ADdica-de-proveedores-en-el-registro-nacional-de)

En la pagina publicada por la plataforma de datos abiertos se indica `Fecha modificada: 2025-04-07` y que el listado se actualiza mensualmente.

### 2. Datos de la Adjudicacion

Este dataset expone la buena pro: postor ganador, valor adjudicado, fechas y otros datos del resultado adjudicado.

Valor para el MVP:

- Es la forma mas directa de saber si un proveedor obtuvo una adjudicacion.
- Permite construir una vista simplificada de actividad contractual sin tener que modelar primero todo el ciclo de contratacion.
- Aporta monto, fecha y contexto minimo del proceso para futuros cruces y scoring.
- Se alinea con el objetivo de detectar coincidencias relevantes, no con reconstruir toda la operacion contractual.

Fuente oficial:

- [Datos de la Adjudicacion](https://www.datosabiertos.gob.pe/dataset/datos-de-la-adjudicaci%C3%B3n-organismo-supervisor-de-las-contrataciones-del-estado-osce)

En la pagina del dataset se muestra `Fecha modificada: 2025-04-07`.

### 3. Entidades Contratantes

Este dataset funciona como tabla maestra de entidades publicas contratantes con registro activo en SEACE.

Valor para el MVP:

- Sirve para normalizar y estabilizar la entidad contratante.
- Evita depender solo del texto libre que venga en adjudicaciones.
- Mejora la calidad de matching entre actividad contractual y organizaciones publicas.

Fuente oficial:

- [Entidades Contratantes](https://datosabiertos.gob.pe/node/20217/dataset)

En la pagina del dataset se muestra `Fecha modificada: 2025-04-07`.

## Datasets que dejamos fuera del MVP inicial

### Contratos de las entidades

Es util, pero agrega complejidad temprana. Para el MVP, `Datos de la Adjudicacion` ya nos da una senal mas simple y suficiente de actividad contractual.

Se puede sumar despues para enriquecer:

- numero y estado contractual
- detalles adicionales del contrato
- trazabilidad posterior a la adjudicacion

Fuente:

- [Contratos de las entidades](https://www.datosabiertos.gob.pe/dataset/contratos-de-las-entidades-organismo-supervisor-de-las-contrataciones-del-estado-osce)

### Datos de la Convocatoria o Invitacion

Es mas util para analitica del proceso que para cruces del MVP. Describe convocatorias adjudicadas, pero no mejora tanto el enlace persona-proveedor-adjudicacion en la primera iteracion.

Fuente:

- [Datos de la Convocatoria o Invitacion](https://www.datosabiertos.gob.pe/dataset/datos-de-la-convocatoria-o-invitaci%C3%B3n-de-las-entidades-organismo-supervisor-de-las)

### Ordenes de Compra y/o Servicios

Puede ser muy util mas adelante, pero aumenta el alcance funcional del ETL sin ser imprescindible para probar el valor central del MVP.

Fuente:

- [Ordenes de Compra y/o Servicios](https://www.datosabiertos.gob.pe/dataset/%C3%B3rdenes-de-compra-yo-servicios-de-las-entidades-organismo-supervisor-de-las-contrataciones)

### Proveedores y Consorcios

Es util como apoyo, pero solapa parte del universo de proveedores adjudicados y no resuelve por si solo el cruce con personas mejor que la dupla `Personas declaradas en RNP + Datos de la Adjudicacion`.

Fuente:

- [Proveedores y Consorcios](https://www.datosabiertos.gob.pe/dataset/proveedores-y-consorcios-organismo-supervisor-de-las-contrataciones-del-estado-osce)

## Campos minimos a importar

### Personas declaradas en RNP

- identificador del proveedor
- razon social del proveedor
- RUC u otro identificador del proveedor
- nombre completo de la persona declarada
- tipo de persona o documento, si existe
- numero de documento, si existe
- rol declarado: socio, accionista, titular, representante legal, miembro de organo, u otro
- vigencia o fecha relevante del registro
- URL o identificador de evidencia

### Datos de la Adjudicacion

- identificador del proceso o adjudicacion
- identificador de la entidad contratante
- nombre de la entidad contratante
- identificador del proveedor adjudicado
- razon social del proveedor adjudicado
- RUC del proveedor adjudicado
- tipo de proceso
- objeto o descripcion breve
- valor adjudicado
- moneda
- fecha de adjudicacion o buena pro
- estado relevante, si existe
- URL o identificador de evidencia

### Entidades Contratantes

- identificador de la entidad
- nombre oficial
- sigla, si existe
- nivel de gobierno o sector, si existe
- estado de actividad, si existe
- URL o identificador de evidencia

## Como encaja con el modelo actual

Con el esquema de `apps/api/src/db/schema.ts`, este subset se puede mapear asi:

- `source_records`: evidencia cruda y payload normalizado de cada fila o registro relevante
- `entities`: proveedores y entidades contratantes
- `person_entity_links`: vinculos persona -> proveedor desde RNP
- vista simplificada de actividad contractual: proveedor -> adjudicacion -> entidad contratante

La primera version no necesita crear nuevas tablas para demostrar valor. El modelo actual ya soporta trazabilidad y relaciones suficientes para el MVP.

## Estrategia de implementacion sugerida

### Fase 1

- Importar `Personas declaradas en RNP`
- Crear entidades proveedor
- Crear `person_entity_links` con el rol declarado

### Fase 2

- Importar `Datos de la Adjudicacion`
- Reutilizar o crear entidades de proveedores y entidades contratantes
- Construir una proyeccion simplificada de actividad contractual

### Fase 3

- Enriquecer con `Entidades Contratantes`
- Afinar normalizacion y matching de entidades publicas

## Riesgos y limitaciones

- La calidad del matching dependera de la consistencia de nombres y RUC entre datasets.
- El dataset de personas declaradas en RNP refleja informacion declarada por proveedores y puede cambiar con actualizaciones posteriores.
- `Datos de la Adjudicacion` no reemplaza todo el ciclo contractual; solo cubre bien la senal de adjudicacion.
- Algunas relaciones utiles para scoring futuro podrian requerir luego `Contratos de las entidades` o `Ordenes de Compra y/o Servicios`.

## Conclusion

El subset recomendado para el MVP es:

- `Personas declaradas en la conformacion juridica de proveedores en el RNP`
- `Datos de la Adjudicacion`
- `Entidades Contratantes`

Es el recorte que mejor balancea:

- valor investigativo temprano
- facilidad de cruce con DJI
- trazabilidad a evidencia oficial
- alcance tecnico razonable para un ETL incremental del MVP
