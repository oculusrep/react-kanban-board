import { useEffect, useState } from "react";
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

export default function KanbanBoard() {
  const { columns, cards, loading } = useKanbanData();
  const [localCards, setLocalCards] = useState<DealCard[]>([]);

  useEffect(() => {
    setLocalCards(cards);
  }, [cards]);

  useEffect(() => {
    document.title = "Master Pipeline";
  }, []);

  const handleDragEnd = async (result: DropResult) => {
    const { destination, draggableId } = result;
    if (!destination) return;

    const destColId = destination.droppableId;

    const updatedCards = [...localCards];
    const draggedCard = updatedCards.find((card) => card.id === draggableId);

    if (!draggedCard) return;

    draggedCard.stage_id = destColId;

    const cardsInDest = updatedCards
      .filter((card) => card.stage_id === destColId && card.id !== draggableId)
      .sort((a, b) => (a.kanban_position ?? 0) - (b.kanban_position ?? 0));

    cardsInDest.splice(destination.index, 0, draggedCard);

    cardsInDest.forEach((card, index) => {
      card.kanban_position = index;
    });

    setLocalCards(updatedCards);

    const updates = cardsInDest.map((card) =>
      supabase
        .from("deal")
        .update({
          stage_id: card.stage_id,
          kanban_position: card.kanban_position,
        })
        .eq("id", card.id)
    );

    await Promise.all(updates);
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

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4 overflow-x-auto bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Master Pipeline</h1>
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
                              className={`bg-white p-2 rounded shadow mb-2 border text-sm ${
                                snapshot.isDragging ? "bg-yellow-100" : ""
                              }`}
                            >
                              <div className="font-semibold">
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