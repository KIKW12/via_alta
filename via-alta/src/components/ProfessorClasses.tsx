import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Professor } from '@/api/getProfessors';
import { Check, X, Save, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from './ui/input';

interface ProfessorClassesProps {
  professor: Professor | null;
  onSave: (updatedClasses?: string) => void;
  onCancel: () => void;
}

// Define interfaces for API response structure based on actual data
interface Degree {
  id: number;
  name: string;
  status: string;
}

interface Plan {
  id: number;
  version: string;
  status: string;
  degree: Degree;
}

interface CourseSubject {
  id: number;
  name: string;
  plans?: Plan[];
  degreeIds?: number[]; // Store degree IDs for filtering
}

interface RawCourseData {
  id: number;
  name: string;
  plans?: Plan[];
}

export default function ProfessorClasses({ professor, onSave, onCancel }: ProfessorClassesProps) {
  const [subjects, setSubjects] = useState<CourseSubject[]>([]);
  const [filteredSubjects, setFilteredSubjects] = useState<CourseSubject[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSubjects, setSelectedSubjects] = useState<Set<number>>(new Set());
  const [selectedDegreeId, setSelectedDegreeId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [initialSelectedSubjects, setInitialSelectedSubjects] = useState<Set<number>>(new Set());

  // Log professor data to debug
  useEffect(() => {
    console.log("Professor data in ProfessorClasses:", professor);
  }, [professor]);

  // Helper function to format professor name properly
  const formatProfessorName = () => {
    if (!professor) return "";
    
    if (professor.first_surname || professor.second_surname) {
      // If we have surname data, prioritize using name + surnames format
      const nameParts = [];
      if (professor.first_name) nameParts.push(professor.first_name);
      if (professor.first_surname) nameParts.push(professor.first_surname);
      if (professor.second_surname) nameParts.push(professor.second_surname);
      return nameParts.length > 0 ? nameParts.join(' ') : professor.name;
    } 
    else if (professor.first_name || professor.last_name) {
      // Fall back to first_name and last_name fields
      return `${professor.first_name || ''} ${professor.last_name || ''}`.trim();
    }
    // Fallback to just the name field
    return professor.name || 'Profesor';
  };

  // Fetch degrees from API
  useEffect(() => {
    const fetchDegrees = async () => {
      try {
        console.log("Fetching degrees from API...");
        const response = await fetch('/api/getDegrees');
        
        if (response.ok) {
          const data = await response.json();
          console.log("API Degrees response:", data);
          
          if (data.degrees && Array.isArray(data.degrees)) {
            console.log("Using degrees from API:", data.degrees);
            setDegrees(data.degrees);
          } else {
            console.warn("API didn't return valid degrees data");
            setDegrees([]);
          }
        } else {
          console.warn("Failed to fetch degrees");
          setDegrees([]);
        }
      } catch (error) {
        console.error("Error fetching degrees:", error);
        setDegrees([]);
      }
    };
    
    fetchDegrees();
  }, []);

  // Fetch course details with plan information
  useEffect(() => {
    const fetchCourseDetails = async () => {
      setIsLoading(true);
      try {
        // Create a new API endpoint that returns complete course data with plans
        const response = await fetch('/api/course-details');
        
        if (response.ok) {
          const data = await response.json();
          console.log("Course details response:", data);
          
          if (data.success && Array.isArray(data.data)) {
            // Process courses to extract degree IDs for filtering
            const processedCourses: CourseSubject[] = data.data.map((course: RawCourseData) => {
              // Extract all degree IDs from plans
              const degreeIds: number[] = course.plans?.map((plan: Plan) => plan.degree.id) || [];
              
              return {
              id: course.id,
              name: course.name,
              plans: course.plans,
              degreeIds: degreeIds
              };
            });
            
            console.log("Processed courses with degree IDs:", processedCourses);
            setSubjects(processedCourses);
            setFilteredSubjects(processedCourses);
          } else {
            // Fallback to basic subjects
            fetchBasicSubjects();
          }
        } else {
          console.warn("Failed to fetch course details");
          // Fallback to basic subjects
          fetchBasicSubjects();
        }
      } catch (error) {
        console.error("Error fetching course details:", error);
        // Fallback to basic subjects
        fetchBasicSubjects();
      } finally {
        setIsLoading(false);
      }
    };
    
    // Fallback function for fetching basic subject data
    const fetchBasicSubjects = async () => {
      try {
        const response = await fetch('/api/subjects');
        
        if (response.ok) {
          const subjectsData = await response.json();
          
          if (Array.isArray(subjectsData)) {
            // Map to our required structure
            const mappedSubjects = subjectsData.map(subject => ({
              id: subject.id,
              name: subject.name
            }));
            
            setSubjects(mappedSubjects);
            setFilteredSubjects(mappedSubjects);
          } else {
            setSubjects([]);
            setFilteredSubjects([]);
            toast.error("Invalid subjects data format");
          }
        } else {
          setSubjects([]);
          setFilteredSubjects([]);
          toast.error("Failed to fetch subjects");
        }
      } catch (error) {
        console.error("Error fetching subjects:", error);
        setSubjects([]);
        setFilteredSubjects([]);
        toast.error("Error loading subjects");
      }
    };
    
    fetchCourseDetails();
  }, []);

  // Set selected subjects when professor data changes
  useEffect(() => {
    if (!professor?.classes || subjects.length === 0) return;
    
    try {
      // Handle both formats - IDs or names
      if (/^\d+(,\d+)*$/.test(professor.classes)) {
        // If it's a list of numbers (old format)
        const classIds = professor.classes.split(',')
          .map(id => parseInt(id.trim()))
          .filter(id => !isNaN(id));
        setSelectedSubjects(new Set(classIds));
        setInitialSelectedSubjects(new Set(classIds));
      } else {
        // If it's a list of names (new format)
        // Find the IDs that match the names
        const classNames = professor.classes.split(',').map(name => name.trim());
        const matchingIds = subjects
          .filter(subject => classNames.includes(subject.name))
          .map(subject => subject.id);
        setSelectedSubjects(new Set(matchingIds));
        setInitialSelectedSubjects(new Set(matchingIds));
      }
    } catch (error) {
      console.error("Error processing professor's classes:", error);
    }
  }, [professor?.classes, subjects]);

  // Filter subjects by degree ID and search query
  useEffect(() => {
    let filtered = [...subjects];
    
    // Apply degree filter
    if (selectedDegreeId !== "all") {
      const degreeId = parseInt(selectedDegreeId);
      console.log(`Filtering by degree ID: ${degreeId}`);
      
      // Filter subjects that have the selected degree ID in their degreeIds array
      filtered = filtered.filter(subject => 
        subject.degreeIds?.includes(degreeId)
      );
      
      console.log(`Found ${filtered.length} subjects for degree ID ${degreeId}`);
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(subject => 
        subject.name.toLowerCase().includes(query)
      );
    }
    
    // Remove subjects that are already selected
    filtered = filtered.filter(subject => !selectedSubjects.has(subject.id));
    
    setFilteredSubjects(filtered);
  }, [subjects, selectedDegreeId, searchQuery, selectedSubjects]);

  // Helper function to check if two sets are equal
  const areSetsEqual = (setA: Set<number>, setB: Set<number>) => {
    if (setA.size !== setB.size) return false;
    for (const item of setA) {
      if (!setB.has(item)) return false;
    }
    return true;
  };

  // Toggle a subject selection
  const toggleSubject = (subjectId: number) => {
    const newSelected = new Set(selectedSubjects);
    if (newSelected.has(subjectId)) {
      newSelected.delete(subjectId);
    } else {
      newSelected.add(subjectId);
    }
    setSelectedSubjects(newSelected);
    setHasChanges(!areSetsEqual(newSelected, initialSelectedSubjects));
  };

  // Save the selected subjects
  const handleSave = async () => {
    if (!professor) return;
    
    setIsSaving(true);
    try {
      // Get the names of the selected subjects
      const selectedSubjectNames = Array.from(selectedSubjects)
        .map(id => subjects.find(subject => subject.id === id)?.name || '')
        .filter(name => name !== '');
      
      // Store the classes as a comma-separated string
      const classesString = selectedSubjectNames.join(',');
      
      // Store the names instead of IDs
      const response = await fetch('/api/professors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          professorId: professor.id,
          classes: classesString
        }),
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to update classes');
      }

      toast.success('Materias actualizadas correctamente');
      onSave(classesString);
      setInitialSelectedSubjects(new Set(selectedSubjects));
      setHasChanges(false);
    } catch (error) {
      console.error("Error saving professor classes:", error);
      toast.error('Error al guardar las materias');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle cancel button click
  const handleCancel = () => {
    // Reset selected subjects to initial state
    setSelectedSubjects(new Set(initialSelectedSubjects));
    setHasChanges(false);
    // Call the parent component's onCancel function
    onCancel();
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
      {hasChanges && (
        <div className="mb-4 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-yellow-800 text-sm flex items-center">
            <Save className="w-4 h-4 mr-2" />
            Tienes cambios sin guardar. No olvides guardar antes de salir.
          </p>
        </div>
      )}
      {selectedSubjects.size > 0 && (
          <div className="mb-4">
            <h2 className="text-xl font-semibold mb-2">Materias seleccionadas</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Array.from(selectedSubjects).map(id => {
                const subject = subjects.find(s => s.id === id);
                return subject ? (
                  <div 
                    key={`selected-${id}`}
                    className="p-2 border rounded-md cursor-pointer bg-green-100 border-green-500"
                    onClick={() => toggleSubject(id)}
                  >
                    <div className="flex items-center">
                      <div className="w-5 h-5 mr-2 flex items-center justify-center border rounded bg-green-500 border-green-500">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm">{subject.name}</span>
                        {subject.plans && subject.plans.length > 0 && (
                          <span className="text-xs text-gray-500">
                            {subject.plans[0].degree.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null;
              })}
            </div>
            <div className="border-t border-gray-200 my-3"></div>
          </div>
        )}
        <div className='flex flex-row items-center justify-between grid grid-cols-4'>
          <CardTitle className="text-xl mb-2 col-span-1">Asignar materias</CardTitle>
          <Select 
              value={selectedDegreeId}
              onValueChange={(value) => {
                console.log("Selected degree ID changed to:", value);
                setSelectedDegreeId(value);
              }}
            >
              <SelectTrigger className="w-full text-sm col-span-3">
                <SelectValue placeholder="Todas las carreras" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las carreras</SelectItem>
                {degrees.map((degree) => (
                  <SelectItem key={degree.id} value={degree.id.toString()}>{degree.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
        </div>
      </CardHeader>
      <CardContent>
        {/* Selected subjects section */}
        

        <div className="space-y-4">
            <div className="relative col-span-3 flex">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar materia..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className=" pl-10 bg-gray-50 border-gray-200 col-span-3"
            />
                </div>
          </div>
        
        {isLoading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800 mb-2"></div>
            <p className="text-gray-500">Cargando materias disponibles...</p>
          </div> 
          
        ) : subjects.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-gray-500">No hay materias disponibles</p>
          </div>
        ) : filteredSubjects.length > 0 ? (
          <div className="max-h-[240px] overflow-y-auto mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {filteredSubjects.map((subject) => (
                <div 
                  key={subject.id} 
                  className={`p-2 border rounded-md cursor-pointer ${
                    selectedSubjects.has(subject.id) ? 'bg-green-100 border-green-500' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => toggleSubject(subject.id)}
                >
                  <div className="flex items-center">
                    <div className={`w-5 h-5 mr-2 flex items-center justify-center border rounded ${
                      selectedSubjects.has(subject.id) ? 'bg-green-500 border-green-500' : 'border-gray-400'
                    }`}>
                      {selectedSubjects.has(subject.id) && <Check className="w-4 h-4 text-white" />}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm">{subject.name}</span>
                      {subject.plans && subject.plans.length > 0 && (
                        <span className="text-xs text-gray-500">
                          {subject.plans[0].degree.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-gray-500">No se encontraron materias que coincidan con los filtros actuales</p>
          </div>
        )}

      </CardContent>
      <CardFooter className="flex justify-between border-t p-3">
        <Button 
          variant="outline" 
          onClick={handleCancel}
          className="flex items-center gap-2 text-black"
        >
          <X className="w-4 h-4 " />
          Cancelar
        </Button>
        <Button 
          onClick={handleSave} 
          disabled={isSaving || !hasChanges}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
        >
          {isSaving ? (
            <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-1"></div>
          ) : (
            <Save className="w-4 h-4" />
          )}
          {isSaving ? 'Guardando...' : 'Guardar Información del Profesor'}
        </Button>
      </CardFooter>
    </Card>
  );
}