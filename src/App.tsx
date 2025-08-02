import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
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

    // Update local state
    setLocalCards((prev) =>
      prev.map((card) =>
        card.id === draggableId ? { ...card, stage_id: destination.droppableId } : card
      )
    );

    // Update Supabase
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
    <div className="p-4 overflow-x-auto">
      <h1 className="text-2xl font-bold mb-4">Kanban Board (Supabase)</h1>
      <div className="flex gap-[2px] min-w-max">
        <DragDropContext onDragEnd={handleDragEnd}>
          {columns.map((column) => {
            let cardsInColumn = localCards.filter((card) => card.stage_id === column.id);

            // Apply filter for "Closed Paid" column to only show deals with close_date in current year
            if (column.name === "Closed Paid") {
              cardsInColumn = cardsInColumn.filter((card: any) => {
                if (!card.close_date) return false;
                const year = new Date(card.close_date).getFullYear();
                return year === currentYear;
              });
            }

            const totalFee = cardsInColumn.reduce((sum, card) => sum + card.fee, 0);

            return (
              <Droppable key={column.id} droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`bg-gray-100 rounded p-1 min-w-[220px] min-h-[200px] transition-all duration-200 ${
                      snapshot.isDraggingOver ? "bg-blue-100" : ""
                    }`}
                  >
                    <h2 className="text-lg font-semibold mb-1">
                      {column.name} ({cardsInColumn.length})
                    </h2>
                    <div className="text-sm text-green-700 font-semibold mb-2">
                      {formatCurrency(totalFee)}
                    </div>
                    {cardsInColumn.map((card, index) => (
                      <Draggable key={card.id} draggableId={card.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`bg-white p-2 rounded shadow mb-2 transition-all duration-200 ${
                              snapshot.isDragging ? "bg-yellow-100" : ""
                            }`}
                          >
                            <div className="text-sm font-semibold">{card.deal_name}</div>
                            <div className="text-sm text-gray-700">
                              {formatCurrency(card.fee)}
                            </div>
                            <div className="text-xs text-gray-500">{card.client_name}</div>
                            <div className="text-sm text-gray-800">
                              {formatCurrency(card.deal_value)}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
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
