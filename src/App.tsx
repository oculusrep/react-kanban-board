import { useEffect, useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import useKanbanData from "./lib/useKanbanData";
import { supabase } from "./lib/supabaseClient";

function App() {
  const { columns, cards, loading } = useKanbanData();
  const [localCards, setLocalCards] = useState<typeof cards>([]);

  useEffect(() => {
    setLocalCards(cards);
  }, [cards]);

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    setLocalCards((prev) =>
      prev.map((card) =>
        card.id === draggableId ? { ...card, stage_id: destination.droppableId } : card
      )
    );

    const { error } = await supabase
      .from("deal")
      .update({ stage_id: destination.droppableId })
      .eq("id", draggableId);

    if (error) {
      console.error("Error updating stage:", error);
    }
  };

  const formatCurrency = (value: number, decimals = 0) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);

  if (loading) return <div className="p-4">Loading...</div>;

  const currentYear = new Date().getFullYear();

  return (
    <div className="p-4 overflow-x-auto bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Kanban Board (Supabase)</h1>
      <div className="flex min-w-max gap-[2px]">
        <DragDropContext onDragEnd={handleDragEnd}>
          {columns.map((column, index) => {
            let cardsInColumn = localCards.filter((card) => card.stage_id === column.id);

            if (column.name === "Closed Paid") {
              cardsInColumn = cardsInColumn.filter((card: any) => {
                if (!card.close_date) return false;
                const year = new Date(card.close_date).getFullYear();
                return year === currentYear;
              });
            }

            const totalFee = cardsInColumn.reduce((sum, card) => sum + card.fee, 0);
            const isLastColumn = index === columns.length - 1;
            const isFirstColumn = index === 0;

            return (
              <Droppable key={column.id} droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`relative min-w-[240px] bg-white border shadow-sm rounded-md flex flex-col ${
                      snapshot.isDraggingOver ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className="relative">
                      <div
                        className={`text-white py-2 px-3 font-semibold text-sm flex items-center justify-center clip-chevron bg-blue-600 ${
                          isFirstColumn ? "" : "chevron-overlap"
                        } ${isLastColumn ? "last" : ""}`}
                      >
                        <div className="text-center">
                          {column.name} ({cardsInColumn.length})
                          <div className="text-green-200 text-xs font-bold">
                            {formatCurrency(totalFee)}
                          </div>
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
                              <div className="font-semibold">{card.deal_name}</div>
                              <div className="text-gray-700">{formatCurrency(card.fee)}</div>
                              <div className="text-gray-500 text-xs">{card.client_name}</div>
                              <div className="text-gray-800">{formatCurrency(card.deal_value)}</div>
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

export default App;
