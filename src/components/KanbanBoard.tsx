import { useEffect, useState, useRef } from "react";
import {
  DragDropContext,
  DropResult,
  Droppable,
  Draggable,
} from "@hello-pangea/dnd";
import { Link } from "react-router-dom";
import useKanbanData from "../hooks/useKanbanData";
import { supabase } from "../lib/supabaseClient";
import { DealCard } from "../lib/types"; // Import from central types
import ConfirmDialog from "./ConfirmDialog";
import Toast from "./Toast";
import { useToast } from "../hooks/useToast";
import LossReasonModal from "./LossReasonModal";
import ClosedDateModal from "./ClosedDateModal";
import BookedDateModal from "./BookedDateModal";

export default function KanbanBoard() {
  const { columns, cards, loading } = useKanbanData();
  const [localCards, setLocalCards] = useState<DealCard[]>([]);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [dealToDelete, setDealToDelete] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { toast, showToast, hideToast } = useToast();

  // Loss reason modal state
  const [showLossReasonModal, setShowLossReasonModal] = useState(false);
  const [pendingDragResult, setPendingDragResult] = useState<DropResult | null>(null);
  const [currentLossReason, setCurrentLossReason] = useState<string | null>(null);
  const [dealNameForModal, setDealNameForModal] = useState<string>('');

  // Closed date modal state
  const [showClosedDateModal, setShowClosedDateModal] = useState(false);
  const [currentClosedDate, setCurrentClosedDate] = useState<string | null>(null);

  // Booked date modal state
  const [showBookedDateModal, setShowBookedDateModal] = useState(false);
  const [currentBookedDate, setCurrentBookedDate] = useState<string | null>(null);

  useEffect(() => {
    setLocalCards(cards);
  }, [cards]);

  useEffect(() => {
    document.title = "Master Pipeline | OVIS";
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdownId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDragEnd = async (result: DropResult) => {
    const { destination, draggableId } = result;
    if (!destination) return;

    const destColId = destination.droppableId;

    // Find the destination stage label
    const destStage = columns.find(col => col.id === destColId);
    const destStageLabel = destStage?.label;

    const draggedCard = localCards.find((card) => card.id === draggableId);
    if (!draggedCard) return;

    // If moving to "Lost" stage, check if loss_reason exists
    if (destStageLabel === "Lost") {
      // Fetch the full deal data to check for loss_reason
      const { data: dealData, error } = await supabase
        .from("deal")
        .select("loss_reason, deal_name")
        .eq("id", draggableId)
        .single();

      if (error) {
        console.error("Error fetching deal:", error);
        return;
      }

      // If no loss_reason, show modal
      if (!dealData.loss_reason || dealData.loss_reason.trim() === "") {
        setPendingDragResult(result);
        setCurrentLossReason(dealData.loss_reason);
        setDealNameForModal(dealData.deal_name || 'this deal');
        setShowLossReasonModal(true);
        return; // Don't proceed with drag until loss reason is provided
      }
    }

    // If moving to "Closed Paid" stage, check if closed_date exists
    if (destStageLabel === "Closed Paid") {
      // Fetch the full deal data to check for closed_date
      const { data: dealData, error } = await supabase
        .from("deal")
        .select("closed_date, deal_name")
        .eq("id", draggableId)
        .single();

      if (error) {
        console.error("Error fetching deal:", error);
        return;
      }

      // If no closed_date, show modal
      if (!dealData.closed_date) {
        setPendingDragResult(result);
        setCurrentClosedDate(dealData.closed_date);
        setDealNameForModal(dealData.deal_name || 'this deal');
        setShowClosedDateModal(true);
        return; // Don't proceed with drag until closed date is provided
      }
    }

    // If moving to "Booked" stage, check if booked_date exists
    if (destStageLabel === "Booked") {
      // Fetch the full deal data to check for booked_date
      const { data: dealData, error } = await supabase
        .from("deal")
        .select("booked_date, deal_name")
        .eq("id", draggableId)
        .single();

      if (error) {
        console.error("Error fetching deal:", error);
        return;
      }

      // If no booked_date, show modal
      if (!dealData.booked_date) {
        setPendingDragResult(result);
        setCurrentBookedDate(dealData.booked_date);
        setDealNameForModal(dealData.deal_name || 'this deal');
        setShowBookedDateModal(true);
        return; // Don't proceed with drag until booked date is provided
      }
    }

    // Proceed with the drag operation
    await performDragUpdate(result);
  };

  const performDragUpdate = async (result: DropResult) => {
    const { destination, draggableId } = result;
    if (!destination) return;

    const destColId = destination.droppableId;

    const updatedCards = [...localCards];
    const draggedCard = updatedCards.find((card) => card.id === draggableId);

    if (!draggedCard) return;

    // Track original stage for the dragged card
    const originalStageId = draggedCard.stage_id;
    const stageChanged = originalStageId !== destColId;

    draggedCard.stage_id = destColId;

    // Find the destination stage label
    const destStage = columns.find(col => col.id === destColId);
    const isMovingToLost = destStage?.label === "Lost" && stageChanged;
    const isMovingToClosedPaid = destStage?.label === "Closed Paid" && stageChanged;
    const isMovingToBooked = destStage?.label === "Booked" && stageChanged;

    const cardsInDest = updatedCards
      .filter((card) => card.stage_id === destColId && card.id !== draggableId)
      .sort((a, b) => (a.kanban_position ?? 0) - (b.kanban_position ?? 0));

    // If moving to Lost, Closed Paid, or Booked for the first time, force position at top (index 0)
    // Otherwise, use the destination index from the drag
    const insertIndex = (isMovingToLost || isMovingToClosedPaid || isMovingToBooked) ? 0 : destination.index;
    cardsInDest.splice(insertIndex, 0, draggedCard);

    cardsInDest.forEach((card, index) => {
      card.kanban_position = index;
    });

    setLocalCards(updatedCards);

    const now = new Date().toISOString();

    // Update cards in destination column
    const updates = cardsInDest.map((card) => {
      const updateData: any = {
        stage_id: card.stage_id,
        kanban_position: card.kanban_position,
      };

      // Only update last_stage_change_at for the dragged card if stage changed
      if (card.id === draggableId && stageChanged) {
        updateData.last_stage_change_at = now;
      }

      return supabase
        .from("deal")
        .update(updateData)
        .eq("id", card.id);
    });

    await Promise.all(updates);
  };

  const handleLossReasonSave = async (lossReason: string) => {
    if (!pendingDragResult) return;

    const { draggableId } = pendingDragResult;

    // Update the deal with the loss_reason
    const { error } = await supabase
      .from("deal")
      .update({ loss_reason: lossReason })
      .eq("id", draggableId);

    if (error) {
      console.error("Error saving loss reason:", error);
      showToast("Failed to save loss reason: " + error.message, { type: "error" });
      setShowLossReasonModal(false);
      setPendingDragResult(null);
      return;
    }

    // Close modal and proceed with drag
    setShowLossReasonModal(false);
    await performDragUpdate(pendingDragResult);
    setPendingDragResult(null);
    showToast("Deal marked as Lost", { type: "success" });
  };

  const handleLossReasonCancel = () => {
    setShowLossReasonModal(false);
    setPendingDragResult(null);
    // Optionally refresh the kanban board to reset any UI changes
    setLocalCards([...cards]);
  };

  const handleClosedDateSave = async (closedDate: string) => {
    if (!pendingDragResult) return;

    const { draggableId } = pendingDragResult;

    // Update the deal with the closed_date
    const { error } = await supabase
      .from("deal")
      .update({ closed_date: closedDate })
      .eq("id", draggableId);

    if (error) {
      console.error("Error saving closed date:", error);
      showToast("Failed to save closed date: " + error.message, { type: "error" });
      setShowClosedDateModal(false);
      setPendingDragResult(null);
      return;
    }

    // Close modal and proceed with drag
    setShowClosedDateModal(false);
    await performDragUpdate(pendingDragResult);
    setPendingDragResult(null);
    showToast("Deal marked as Closed Paid", { type: "success" });
  };

  const handleClosedDateCancel = () => {
    setShowClosedDateModal(false);
    setPendingDragResult(null);
    // Optionally refresh the kanban board to reset any UI changes
    setLocalCards([...cards]);
  };

  const handleBookedDateSave = async (bookedDate: string) => {
    if (!pendingDragResult) return;

    const { draggableId } = pendingDragResult;

    // Update the deal with the booked_date and auto-check booked
    const { error } = await supabase
      .from("deal")
      .update({ booked_date: bookedDate, booked: true })
      .eq("id", draggableId);

    if (error) {
      console.error("Error saving booked date:", error);
      showToast("Failed to save booked date: " + error.message, { type: "error" });
      setShowBookedDateModal(false);
      setPendingDragResult(null);
      return;
    }

    // Close modal and proceed with drag
    setShowBookedDateModal(false);
    await performDragUpdate(pendingDragResult);
    setPendingDragResult(null);
    showToast("Deal marked as Booked", { type: "success" });
  };

  const handleBookedDateCancel = () => {
    setShowBookedDateModal(false);
    setPendingDragResult(null);
    // Optionally refresh the kanban board to reset any UI changes
    setLocalCards([...cards]);
  };

  const formatCurrency = (value: number | null | undefined, decimals = 0) =>
    typeof value === "number"
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(value)
      : "--";

  const currentYear = new Date().getFullYear();

  const handleDeleteClick = (dealId: string) => {
    setDealToDelete(dealId);
    setOpenDropdownId(null);
  };

  const confirmDelete = async () => {
    if (!dealToDelete) return;

    try {
      // Delete in correct order to handle foreign key constraints

      // Step 1: Get all commission splits for this deal
      const { data: commissionSplits } = await supabase
        .from("commission_split")
        .select("id")
        .eq("deal_id", dealToDelete);

      // Step 2: Delete payment_splits that reference those commission splits
      if (commissionSplits && commissionSplits.length > 0) {
        const commissionSplitIds = commissionSplits.map(cs => cs.id);

        const { error: paymentSplitError } = await supabase
          .from("payment_split")
          .delete()
          .in("commission_split_id", commissionSplitIds);

        if (paymentSplitError) {
          console.error("Error deleting payment splits:", paymentSplitError);
          throw new Error("Failed to delete related payment splits");
        }
      }

      // Step 3: Delete commission splits
      const { error: commissionError } = await supabase
        .from("commission_split")
        .delete()
        .eq("deal_id", dealToDelete);

      if (commissionError) {
        console.error("Error deleting commission splits:", commissionError);
        throw new Error("Failed to delete related commission splits");
      }

      // Step 4: Delete payments
      const { error: paymentError } = await supabase
        .from("payment")
        .delete()
        .eq("deal_id", dealToDelete);

      if (paymentError) {
        console.error("Error deleting payments:", paymentError);
        throw new Error("Failed to delete related payments");
      }

      // Step 5: Delete activities
      const { error: activityError } = await supabase
        .from("activity")
        .delete()
        .eq("deal_id", dealToDelete);

      if (activityError) {
        console.error("Error deleting activities:", activityError);
        throw new Error("Failed to delete related activities");
      }

      // Step 6: Finally, delete the deal
      const { error: dealError } = await supabase
        .from("deal")
        .delete()
        .eq("id", dealToDelete);

      if (dealError) {
        console.error("Supabase delete error:", dealError);
        throw new Error(dealError.message || "Failed to delete deal");
      }

      // Remove from local state
      setLocalCards(localCards.filter(card => card.id !== dealToDelete));
      setDealToDelete(null);
      showToast("Deal deleted successfully", { type: "success" });
    } catch (error: any) {
      console.error("Error deleting deal:", error);
      const errorMessage = error?.message || "Failed to delete deal. Please try again.";
      showToast(errorMessage, { type: "error" });
      setDealToDelete(null);
    }
  };

  const cancelDelete = () => {
    setDealToDelete(null);
  };

  const toggleDropdown = (cardId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpenDropdownId(openDropdownId === cardId ? null : cardId);
  };

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4 overflow-x-auto bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Master Pipeline</h1>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!dealToDelete}
        title="Delete Deal"
        message="Are you sure you want to delete this deal? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />

      {/* Toast Notification */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onClose={hideToast}
      />

      {/* Loss Reason Modal */}
      <LossReasonModal
        isOpen={showLossReasonModal}
        onClose={handleLossReasonCancel}
        onSave={handleLossReasonSave}
        dealName={dealNameForModal}
        currentLossReason={currentLossReason}
      />

      {/* Closed Date Modal */}
      <ClosedDateModal
        isOpen={showClosedDateModal}
        onClose={handleClosedDateCancel}
        onSave={handleClosedDateSave}
        dealName={dealNameForModal}
        currentClosedDate={currentClosedDate}
      />

      {/* Booked Date Modal */}
      <BookedDateModal
        isOpen={showBookedDateModal}
        onClose={handleBookedDateCancel}
        onSave={handleBookedDateSave}
        dealName={dealNameForModal}
        currentBookedDate={currentBookedDate}
      />

      <div className="flex min-w-max gap-[2px]">
        <DragDropContext onDragEnd={handleDragEnd}>
          {columns.map((column, index) => {
            let cardsInColumn = localCards
              .filter((card) => card.stage_id === column.id)
              .sort((a, b) => (a.kanban_position ?? 0) - (b.kanban_position ?? 0));

            if (column.label === "Closed Paid") {
              cardsInColumn = cardsInColumn.filter((card) => {
                if (!card.closed_date) return false;
                const year = new Date(card.closed_date).getFullYear();
                return year === currentYear;
              });
            }

            const totalFee = cardsInColumn.reduce(
              (sum, card) => sum + (card.fee ?? 0),
              0
            );
            const isLastColumn = index === columns.length - 1;
            const isFirstColumn = index === 0;

            return (
              <Droppable key={column.id} droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                   className={`relative min-w-[240px] max-w-[280px] bg-white shadow-sm flex flex-col ${
                      snapshot.isDraggingOver ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className="relative">
                     <div
                      className={`chevron-header ${isFirstColumn ? "first" : ""} ${isLastColumn ? "last" : ""} flex items-center justify-center`}
                    >
                      <div className="text-center font-semibold text-sm">
                        {column.label} ({cardsInColumn.length})
                      </div>
                    </div>
                    <div className="bg-white text-center py-2 border-b">
                      <div className="text-green-600 text-lg font-bold">
                        {formatCurrency(totalFee)}
                      </div>
                    </div>
                    </div>
                    <div className="p-2 flex-1">
                      {cardsInColumn.map((card, index) => (
                        <Draggable key={card.id} draggableId={card.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`bg-white p-2 rounded shadow mb-2 border text-sm relative ${
                                snapshot.isDragging ? "bg-yellow-100" : ""
                              }`}
                            >
                              {/* Dropdown Menu Button */}
                              <div className="absolute top-2 right-2">
                                <button
                                  onClick={(e) => toggleDropdown(card.id, e)}
                                  className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                                  title="Options"
                                >
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                                    <circle cx="8" cy="3" r="1.5"/>
                                    <circle cx="8" cy="8" r="1.5"/>
                                    <circle cx="8" cy="13" r="1.5"/>
                                  </svg>
                                </button>

                                {/* Dropdown Menu */}
                                {openDropdownId === card.id && (
                                  <div
                                    ref={dropdownRef}
                                    className="absolute right-0 mt-1 w-32 bg-white rounded-md shadow-lg z-50 border border-gray-200"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="py-1">
                                      <Link
                                        to={`/deal/${card.id}`}
                                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                        onClick={() => setOpenDropdownId(null)}
                                      >
                                        Edit
                                      </Link>
                                      <button
                                        onClick={() => handleDeleteClick(card.id)}
                                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="font-semibold pr-6">
                                <Link
                                  to={`/deal/${card.id}`}
                                  className="text-blue-600 hover:underline"
                                >
                                  {card.deal_name || 'Untitled Deal'}
                                </Link>
                              </div>
                              <div className="text-gray-700">
                                {formatCurrency(card.fee)}
                              </div>
                              <div className="text-gray-500 text-xs">
                                {card.client_name || 'No Client'}
                              </div>
                              <div className="text-gray-800">
                                {formatCurrency(card.deal_value)}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </DragDropContext>
      </div>
    </div>
  );
}