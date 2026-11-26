// src/runtime/auth-persistence.js — Sinkronisasi penyimpanan kredensial Baileys
export function createAuthPersistence(saveCreds, logger = console) {
  let resetPending = false;
  let pendingSave = Promise.resolve();

  function queueSave() {
    pendingSave = pendingSave.then(async () => {
      if (resetPending) return false;
      try {
        await saveCreds();
        return true;
      } catch (error) {
        logger.error?.(`[AUTH] Gagal menyimpan kredensial: ${error.message}`);
        return false;
      }
    });
    return pendingSave;
  }

  async function beginReset() {
    resetPending = true;
    await pendingSave;
  }

  return { queueSave, beginReset };
}
