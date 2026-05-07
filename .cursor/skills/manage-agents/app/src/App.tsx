import { useWorkers } from "./hooks/useWorkers";
import { CreateModal } from "./components/CreateModal";
import { DeleteModal } from "./components/DeleteModal";
import { DetailPane } from "./components/DetailPane";
import { WorkerTable } from "./components/WorkerTable";
import { Toaster } from "sonner";
import "./App.css";

function App() {
  const {
    workers,
    initialLoading,
    apiError,
    busyWorkers,
    editing,
    editValue,
    setEditing,
    setEditValue,
    showCreateModal,
    setShowCreateModal,
    deleteTarget,
    setDeleteTarget,
    createPlaceholders,
    selectedName,
    selectedWorker,
    selectedFailedCreate,
    workerDetails,
    detailsLoading,
    noteValue,
    noteSaveError,
    copied,
    handleStart,
    handleStop,
    handleConfirmDelete,
    handleRename,
    handleCreate,
    handleRowClick,
    handleStatusChange,
    handleCopy,
    handleNoteChange,
    handleNoteBlur,
  } = useWorkers();

  return (
    <div className="app">
      <Toaster theme="dark" position="top-right" />

      <div className="header-row">
        <h1>Workers</h1>
        <button className="btn-add" onClick={() => setShowCreateModal(true)}>
          + Add Worker
        </button>
      </div>

      {apiError && <div className="api-error-banner">{apiError}</div>}

      <WorkerTable
        workers={workers}
        createPlaceholders={createPlaceholders}
        initialLoading={initialLoading}
        busyWorkers={busyWorkers}
        selectedName={selectedName}
        editing={editing}
        editValue={editValue}
        copied={copied}
        onRowClick={handleRowClick}
        onStatusChange={handleStatusChange}
        onStart={handleStart}
        onStop={handleStop}
        onDelete={setDeleteTarget}
        onEditStart={(name) => {
          setEditing(name);
          setEditValue(name);
        }}
        onEditChange={setEditValue}
        onEditSave={handleRename}
        onEditCancel={() => setEditing(null)}
        onCopy={handleCopy}
      />

      {selectedName && (selectedFailedCreate || selectedWorker) && (
        <DetailPane
          selectedWorker={selectedWorker}
          selectedFailedCreate={selectedFailedCreate}
          workerDetails={workerDetails}
          detailsLoading={detailsLoading}
          noteValue={noteValue}
          noteSaveError={noteSaveError}
          onNoteChange={handleNoteChange}
          onNoteBlur={handleNoteBlur}
        />
      )}

      <DeleteModal
        worker={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
      />

      <CreateModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
      />
    </div>
  );
}

export default App;
