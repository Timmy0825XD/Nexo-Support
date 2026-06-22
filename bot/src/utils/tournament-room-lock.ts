const tournamentRoomCreationChains = new Map<string, Promise<unknown>>();

/** Serializes room creation per tournament (auto-room, /room create, etc.). */
export function withTournamentRoomCreationLock<T>(
  tournamentId: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = tournamentRoomCreationChains.get(tournamentId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  tournamentRoomCreationChains.set(tournamentId, next);
  return next.finally(() => {
    if (tournamentRoomCreationChains.get(tournamentId) === next) {
      tournamentRoomCreationChains.delete(tournamentId);
    }
  });
}
