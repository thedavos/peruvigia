<script setup lang="ts">
import { onMounted, ref } from "vue";

import { HealthResponseSchema, type HealthResponse } from "@shared";

const props = defineProps<{
  apiBaseUrl: string;
}>();

const loading = ref(true);
const payload = ref<HealthResponse | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    const healthUrl = new URL("/health", props.apiBaseUrl).toString();
    const response = await fetch(healthUrl);
    const json = await response.json();

    payload.value = HealthResponseSchema.parse(json);
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : "No se pudo consultar la salud de la API.";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="status-card">
    <p class="eyebrow">Estado del backend</p>
    <p v-if="loading" class="status-line">Consultando API...</p>
    <template v-else-if="payload">
      <p class="status-line">
        <span class="status-dot" />
        {{ payload.status.toUpperCase() }} / {{ payload.service }}
      </p>
      <p class="meta-line">{{ payload.timestamp }}</p>
    </template>
    <template v-else>
      <p class="status-line error">Sin conexion</p>
      <p class="meta-line">{{ error }}</p>
    </template>
  </section>
</template>

<style scoped>
.status-card {
  display: grid;
  gap: 0.75rem;
  padding: 1.25rem;
  border-radius: 1.5rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.9), rgba(15, 23, 42, 0.72)), rgba(15, 23, 42, 0.72);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25);
}

.eyebrow {
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.92);
}

.status-line {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  font-size: 1.125rem;
  font-weight: 700;
  color: #f8fafc;
}

.status-dot {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 9999px;
  background: #22c55e;
  box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.16);
}

.meta-line {
  font-size: 0.95rem;
  color: rgba(226, 232, 240, 0.78);
}

.error {
  color: #fda4af;
}
</style>
