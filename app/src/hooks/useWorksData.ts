import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ApiError, apiFetch } from "../utils/api";
import { buildWorkConfig, mapBackendWork } from "../utils/worksApi";
import type { BackendWork } from "../utils/worksApi";
import type { OptionsStatus, Work } from "../types";

export interface UseWorksDataState {
  works: Work[];
  setWorks: Dispatch<SetStateAction<Work[]>>;
  activeWorkId: string;
  setActiveWorkId: Dispatch<SetStateAction<string>>;
  isLoadingWorks: boolean;
  workErrors: Record<string, string>;
  setWorkErrors: Dispatch<SetStateAction<Record<string, string>>>;
  handleApiError: (key: string, error: unknown, fallbackMessage: string) => void;
  addWork: () => void;
  renameWork: (workId: string, name: string) => void;
  duplicateWork: (workId: string) => void;
  deleteWork: (workId: string) => void;
}

export const useWorksData = (
  apiUrl: string,
  token: string,
  optionsStatus: OptionsStatus,
  onUnauthorized: () => void,
): UseWorksDataState => {
  const [works, setWorks] = useState<Work[]>([]);
  const [activeWorkId, setActiveWorkId] = useState("");
  const [isLoadingWorks, setIsLoadingWorks] = useState(true);
  const [workErrors, setWorkErrors] = useState<Record<string, string>>({});

  const handleApiError = useCallback(
    (key: string, error: unknown, fallbackMessage: string) => {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized();
        return;
      }
      const message = error instanceof Error ? error.message : fallbackMessage;
      setWorkErrors((prev) => ({ ...prev, [key]: message }));
    },
    [onUnauthorized],
  );

  const loadWorkDetails = useCallback(
    async (workList: BackendWork[]) => {
      // N+1: one GET per work. Fix: add ?include=generations to GET /works (backend ticket).
      const detailedWorks = await Promise.all(
        workList.map(async (work) => {
          const response = await apiFetch(`${apiUrl}/works/${work.id}`, { token });
          return (await response.json()) as BackendWork;
        }),
      );
      return detailedWorks.map(mapBackendWork);
    },
    [apiUrl, token],
  );

  useEffect(() => {
    if (optionsStatus === "loading") return undefined;

    let ignore = false;

    const loadWorks = async () => {
      setIsLoadingWorks(true);
      setWorkErrors((prev) => ({ ...prev, load: "" }));

      try {
        const response = await apiFetch(`${apiUrl}/works`, { token });
        const backendWorks = (await response.json()) as BackendWork[];

        const sourceWorks =
          backendWorks.length > 0
            ? backendWorks
            : [
                (await (
                  await apiFetch(`${apiUrl}/works`, {
                    method: "POST",
                    body: JSON.stringify({}),
                    token,
                  })
                ).json()) as BackendWork,
              ];

        const mappedWorks = await loadWorkDetails(sourceWorks);

        if (!ignore) {
          setWorks(mappedWorks);
          setActiveWorkId(mappedWorks[0]?.id || "");
        }
      } catch (error) {
        if (!ignore) {
          handleApiError("load", error, "Could not load works");
        }
      } finally {
        if (!ignore) {
          setIsLoadingWorks(false);
        }
      }
    };

    void loadWorks();

    return () => {
      ignore = true;
    };
  }, [apiUrl, handleApiError, loadWorkDetails, optionsStatus, token]);

  const addWork = useCallback(() => {
    void (async () => {
      setWorkErrors((prev) => ({ ...prev, add: "" }));
      try {
        const response = await apiFetch(`${apiUrl}/works`, {
          method: "POST",
          body: JSON.stringify({}),
          token,
        });
        const backendWork = (await response.json()) as BackendWork;
        const [nextWork] = await loadWorkDetails([backendWork]);
        setWorks((current) => [...current, nextWork]);
        setActiveWorkId(nextWork.id);
      } catch (error) {
        handleApiError("add", error, "Could not create work");
      }
    })();
  }, [apiUrl, handleApiError, loadWorkDetails, token]);

  const renameWork = useCallback(
    (workId: string, name: string) => {
      const nextName = name.trim();
      const work = works.find((item) => item.id === workId);
      if (!work || !nextName || work.name === nextName) return;

      void (async () => {
        setWorkErrors((prev) => ({ ...prev, rename: "" }));
        try {
          const response = await apiFetch(`${apiUrl}/works/${workId}`, {
            method: "PATCH",
            body: JSON.stringify({ name: nextName, config: buildWorkConfig(work) }),
            token,
          });
          const savedWork = mapBackendWork((await response.json()) as BackendWork);
          setWorks((current) =>
            current.map((w) =>
              w.id === workId
                ? { ...w, name: savedWork.name, savedAt: savedWork.savedAt }
                : w,
            ),
          );
        } catch (error) {
          handleApiError("rename", error, "Could not rename work");
        }
      })();
    },
    [apiUrl, handleApiError, token, works],
  );

  const duplicateWork = useCallback(
    (workId: string) => {
      const source = works.find((w) => w.id === workId);
      if (!source) return;

      void (async () => {
        setWorkErrors((prev) => ({ ...prev, duplicate: "" }));
        try {
          const response = await apiFetch(`${apiUrl}/works`, {
            method: "POST",
            body: JSON.stringify({ duplicateFromId: workId, name: `${source.name} (copy)` }),
            token,
          });
          const backendWork = (await response.json()) as BackendWork;
          const [nextWork] = await loadWorkDetails([backendWork]);
          setWorks((current) => [...current, nextWork]);
          setActiveWorkId(nextWork.id);
        } catch (error) {
          handleApiError("duplicate", error, "Could not duplicate work");
        }
      })();
    },
    [apiUrl, handleApiError, loadWorkDetails, token, works],
  );

  const deleteWork = useCallback(
    (workId: string) => {
      const nextActiveWorkId =
        activeWorkId === workId
          ? (works.find((w) => w.id !== workId)?.id ?? "")
          : activeWorkId;

      void (async () => {
        setWorkErrors((prev) => ({ ...prev, delete: "" }));
        try {
          await apiFetch(`${apiUrl}/works/${workId}`, { method: "DELETE", token });
          setWorks((current) => current.filter((w) => w.id !== workId));
          setActiveWorkId(nextActiveWorkId);
        } catch (error) {
          handleApiError("delete", error, "Could not delete work");
        }
      })();
    },
    [activeWorkId, apiUrl, handleApiError, token, works],
  );

  return {
    works,
    setWorks,
    activeWorkId,
    setActiveWorkId,
    isLoadingWorks,
    workErrors,
    setWorkErrors,
    handleApiError,
    addWork,
    renameWork,
    duplicateWork,
    deleteWork,
  };
};
